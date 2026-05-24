/**
 * Integration tests for PATCH /api/sessions/[id]/character
 *
 * These tests use a real in-memory SQLite database (not a mock) to verify
 * that the handler correctly reads and writes character stats through the
 * Drizzle ORM.  All three mutation branches are exercised:
 *   - stat adjustment (delta / absolute value)
 *   - equipment update
 *   - clear creation rolls
 *
 * Grail Quest–specific mechanics are also tested:
 *   - game-over guard blocks current-stat writes when LP ≤ 0
 *   - XP threshold: crossing a 20-XP boundary permanently raises LP max
 *   - stat delta clamped to stat definition min/max
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { sessions, characters, type CreationRolls } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Bootstrap an isolated in-memory database using vi.hoisted so the same
// instance is available inside the vi.mock factory (hoisted above imports)
// and in the test body.
// ---------------------------------------------------------------------------

const { testDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3')

  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Mirror the production schema.  Raw SQL avoids spawning a child process
  // inside the container's test runner.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      game_system_id TEXT NOT NULL,
      book_title TEXT NOT NULL,
      notes TEXT,
      panel_order TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      stats TEXT NOT NULL,
      initial_stats TEXT NOT NULL,
      creation_rolls TEXT DEFAULT 'null',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS characters_session_id_idx ON characters(session_id);

    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS map_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      map_id INTEGER NOT NULL,
      section_number INTEGER,
      location_type TEXT NOT NULL,
      location_type_custom TEXT,
      notes TEXT,
      visited INTEGER NOT NULL DEFAULT 0,
      is_current INTEGER NOT NULL DEFAULT 0,
      x REAL NOT NULL,
      y REAL NOT NULL,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS map_nodes_current_idx
      ON map_nodes(map_id) WHERE is_current = 1;

    CREATE TABLE IF NOT EXISTS map_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      map_id INTEGER NOT NULL,
      from_node_id INTEGER NOT NULL,
      to_node_id INTEGER NOT NULL,
      target_map_id INTEGER,
      direction TEXT,
      connection_type TEXT NOT NULL,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
      FOREIGN KEY (from_node_id) REFERENCES map_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_node_id) REFERENCES map_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS combats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      enemy_name TEXT NOT NULL,
      enemy_stats TEXT NOT NULL,
      enemy_state TEXT NOT NULL,
      metadata TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'in_progress',
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS combats_active_session_uniq
      ON combats(session_id) WHERE outcome = 'in_progress';

    CREATE TABLE IF NOT EXISTS combat_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      combat_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      detail TEXT NOT NULL,
      damage_dealt INTEGER NOT NULL,
      damage_taken INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (combat_id) REFERENCES combats(id)
    );

    CREATE TABLE IF NOT EXISTS section_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      section_number INTEGER NOT NULL,
      visited_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      is_special INTEGER NOT NULL DEFAULT 0,
      item_type TEXT NOT NULL DEFAULT 'item',
      dose_count INTEGER,
      heal_amount INTEGER,
      heal_dice TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS session_spells (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      spell_id TEXT NOT NULL,
      uses_remaining INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `)

  const testDb = drizzle(sqlite)
  return { testDb }
})

// Replace the production db singleton with the in-memory test database.
vi.mock('@/lib/db', () => ({ db: testDb }))

// Import the handler AFTER the mock is registered so it receives testDb.
const { PATCH } = await import('@/app/api/sessions/[id]/character/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(sessionId: number | string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${sessionId}/character`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(sessionId: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(sessionId) }) }
}

/**
 * Seeds a minimal Grail Quest session + character, returning IDs.
 * Accepts optional override stats so individual tests can customise the
 * starting state without duplicating the insert boilerplate.
 */
function seedSession(opts?: {
  stats?: Record<string, unknown>
  initialStats?: Record<string, unknown>
  creationRolls?: CreationRolls | null
}): { sessionId: number } {
  testDb.insert(sessions).values({
    gameSystemId: 'grail-quest',
    bookTitle: 'Test Adventure',
  }).run()

  const session = testDb.select().from(sessions).all().at(-1)!
  const sessionId = session.id

  testDb.insert(characters).values({
    sessionId,
    stats: opts?.stats ?? { lifePoints: 12, experiencePoints: 0 },
    initialStats: opts?.initialStats ?? { lifePoints: 12, lifePointsXpBonuses: 0 },
    creationRolls: opts?.creationRolls !== undefined ? opts.creationRolls : null,
  }).run()

  return { sessionId }
}

/**
 * Reads the current character stats from the test database for a session.
 */
function readCharacter(sessionId: number) {
  return testDb.select().from(characters).where(eq(characters.sessionId, sessionId)).get()!
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PATCH /api/sessions/[id]/character', () => {
  // Each test seeds its own data; use beforeEach to clear leftovers.
  beforeEach(() => {
    testDb.delete(characters).run()
    testDb.delete(sessions).run()
  })

  // -------------------------------------------------------------------------
  // 1. Valid stat delta applied and persisted
  // -------------------------------------------------------------------------

  it('applies a negative LP delta (damage) and persists the result to the database', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 0 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', delta: -3 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.lifePoints).toBe(9)

    // Verify the database was updated, not just the response payload.
    const saved = readCharacter(sessionId)
    expect((saved.stats as Record<string, unknown>).lifePoints).toBe(9)
  })

  // -------------------------------------------------------------------------
  // 2. Invalid / malformed payload → 400
  // -------------------------------------------------------------------------

  it('returns 400 when payload is missing both delta and value for a stat mutation', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints' }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/delta.*value.*required/i)
  })

  it('returns 400 when stat field is missing from the payload', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, { delta: -1 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/stat.*required/i)
  })

  it('returns 400 for an unknown stat name', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'stamina', delta: 1 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/unknown stat/i)
  })

  it('returns 400 when equipment type is invalid', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, { equipment: 'shield', item: { name: 'Round Shield', value: 1 } }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/weapon.*armour/i)
  })

  it('returns 400 when equipment item is malformed', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, { equipment: 'weapon', item: { name: 'Sword' } }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/item must be/i)
  })

  // -------------------------------------------------------------------------
  // 3. Non-existent session → 404
  // -------------------------------------------------------------------------

  it('returns 404 when the session does not exist', async () => {
    const response = await PATCH(
      makePatchRequest(999999, { stat: 'lifePoints', delta: -1 }),
      makeParams(999999),
    )

    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/session not found/i)
  })

  it('returns 404 when the session exists but has no character record', async () => {
    // Insert a session without a character row.
    testDb.insert(sessions).values({ gameSystemId: 'grail-quest', bookTitle: 'Empty' }).run()
    const orphanSession = testDb.select().from(sessions).all().at(-1)!

    const response = await PATCH(
      makePatchRequest(orphanSession.id, { stat: 'lifePoints', delta: -1 }),
      makeParams(orphanSession.id),
    )

    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/character not found/i)
  })

  // -------------------------------------------------------------------------
  // 4. Game-over guard: current LP ≤ 0 blocks further mutations → 409
  // -------------------------------------------------------------------------

  it('returns 409 when the character is already at 0 LP (game over)', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 0, experiencePoints: 5 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', delta: -1 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(409)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/game over/i)
  })

  it('still allows initialStats writes when current LP is 0 (game over does not block initial)', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 0, experiencePoints: 0 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    // Adjusting initialStats lifePoints must succeed even at LP = 0.
    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', value: 14, target: 'initial' }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
  })

  // -------------------------------------------------------------------------
  // 5. XP threshold: enough XP → LP bonus awarded (Grail Quest mechanic)
  // -------------------------------------------------------------------------

  it('awards +1 LP maximum when XP crosses the first 20-XP threshold', async () => {
    // Start just below the threshold.
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 18 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    // Award 5 XP, pushing total to 23 — crosses the 20-XP boundary.
    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'experiencePoints', delta: 5 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      stats: Record<string, unknown>
      initialStats: Record<string, unknown>
    }

    // The LP maximum in initialStats must have increased by 1.
    expect(body.initialStats.lifePoints).toBe(13)
    expect(body.initialStats.lifePointsXpBonuses).toBe(1)

    // Confirm the database was updated.
    const saved = readCharacter(sessionId)
    expect((saved.initialStats as Record<string, unknown>).lifePoints).toBe(13)
  })

  it('awards cumulative LP bonuses when XP crosses multiple thresholds at once', async () => {
    // Start at 0 XP and jump to 60 XP in one award (3 × 20-XP bonuses).
    const { sessionId } = seedSession({
      stats: { lifePoints: 10, experiencePoints: 0 },
      initialStats: { lifePoints: 10, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'experiencePoints', value: 60 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      initialStats: Record<string, unknown>
    }

    expect(body.initialStats.lifePoints).toBe(13) // 10 base + 3 bonuses
    expect(body.initialStats.lifePointsXpBonuses).toBe(3)
  })

  // -------------------------------------------------------------------------
  // 6. Equipment update round-trips correctly
  // -------------------------------------------------------------------------

  it('sets a weapon and persists it in the stats JSON', async () => {
    const { sessionId } = seedSession()

    const response = await PATCH(
      makePatchRequest(sessionId, {
        equipment: 'weapon',
        item: { name: 'Magic Sword', value: 3 },
      }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.weapon).toEqual({ name: 'Magic Sword', value: 3 })

    const saved = readCharacter(sessionId)
    expect((saved.stats as Record<string, unknown>).weapon).toEqual({ name: 'Magic Sword', value: 3 })
  })

  it('sets armour and persists it without disturbing other stat fields', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 5 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, {
        equipment: 'armour',
        item: { name: 'Chain Mail', value: 2 },
      }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.armour).toEqual({ name: 'Chain Mail', value: 2 })
    // Other fields must remain intact.
    expect(body.stats.lifePoints).toBe(12)
    expect(body.stats.experiencePoints).toBe(5)
  })

  it('replaces an existing weapon entry when equipment is patched again', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 0, weapon: { name: 'Old Dagger', value: 1 } },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, {
        equipment: 'weapon',
        item: { name: 'Long Sword', value: 4 },
      }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.weapon).toEqual({ name: 'Long Sword', value: 4 })
  })

  // -------------------------------------------------------------------------
  // 7. Stat delta clamped to stat definition bounds (min = 0, max = 48 for LP)
  // -------------------------------------------------------------------------

  it('clamps LP to 0 when a delta would push it below the minimum', async () => {
    // The handler clamps to statDef.min (0); it does NOT return an error.
    const { sessionId } = seedSession({
      stats: { lifePoints: 3, experiencePoints: 0 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', delta: -10 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.lifePoints).toBe(0)

    const saved = readCharacter(sessionId)
    expect((saved.stats as Record<string, unknown>).lifePoints).toBe(0)
  })

  it('clamps LP to the stat max (48) when a value would exceed it', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 45, experiencePoints: 0 },
      initialStats: { lifePoints: 48, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', delta: 10 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.lifePoints).toBe(48)
  })

  // -------------------------------------------------------------------------
  // 8. Clear creation rolls branch → 204
  // -------------------------------------------------------------------------

  it('clears creation rolls and returns 204 No Content', async () => {
    // Seed a character with a valid CreationRolls payload so we can verify
    // the clear operation nulls the field.
    const sampleRolls: CreationRolls = {
      lifePoints: {
        attempts: [{ dice: [3, 4], total: 7 }],
        best: 7,
        multiplier: 4,
        result: 28,
        statLabel: 'Life Points',
      },
    }
    const { sessionId } = seedSession({ creationRolls: sampleRolls })

    // Verify the creation rolls exist before clearing.
    const before = readCharacter(sessionId)
    expect(before.creationRolls).not.toBeNull()

    const response = await PATCH(
      makePatchRequest(sessionId, { clearCreationRolls: true }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')

    const after = readCharacter(sessionId)
    expect(after.creationRolls).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 9. Absolute value write persisted correctly
  // -------------------------------------------------------------------------

  it('sets LP to an absolute value using the value field', async () => {
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 0 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', value: 8 }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as { stats: Record<string, unknown> }
    expect(body.stats.lifePoints).toBe(8)

    const saved = readCharacter(sessionId)
    expect((saved.stats as Record<string, unknown>).lifePoints).toBe(8)
  })

  // -------------------------------------------------------------------------
  // 10. Initial stat update clamps current stat when it exceeds new initial
  // -------------------------------------------------------------------------

  it('clamps current LP down to match when initial LP is reduced below current', async () => {
    // current LP = 12, initial LP = 12; reducing initial to 8 must clamp current to 8.
    const { sessionId } = seedSession({
      stats: { lifePoints: 12, experiencePoints: 0 },
      initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
    })

    const response = await PATCH(
      makePatchRequest(sessionId, { stat: 'lifePoints', value: 8, target: 'initial' }),
      makeParams(sessionId),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as {
      stats: Record<string, unknown>
      initialStats: Record<string, unknown>
    }

    expect(body.initialStats.lifePoints).toBe(8)
    expect(body.stats.lifePoints).toBe(8) // clamped down from 12

    const saved = readCharacter(sessionId)
    expect((saved.stats as Record<string, unknown>).lifePoints).toBe(8)
    expect((saved.initialStats as Record<string, unknown>).lifePoints).toBe(8)
  })
})
