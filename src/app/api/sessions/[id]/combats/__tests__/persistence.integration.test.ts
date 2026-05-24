/**
 * Integration tests for combat persistence:
 *   POST /api/sessions/[id]/combats          — start combat
 *   POST /api/sessions/[id]/combats/[id]/rounds — resolve round
 *
 * All tests use a real in-memory SQLite database (no mocks) so they exercise
 * the actual Drizzle ORM writes, transaction behaviour, and outcome logic.
 *
 * Grail Quest is the only registered game system; all fixtures use it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { sessions, characters, combats, combatRounds } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Bootstrap an isolated in-memory database via vi.hoisted so the same
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

  // Mirror the production schema exactly.  Raw SQL avoids spawning a child
  // process inside the container's test runner.
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

    CREATE INDEX IF NOT EXISTS combats_session_id_idx ON combats(session_id);

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

// Import the handlers AFTER the mock is registered so they receive testDb.
const { POST: startCombat } = await import('@/app/api/sessions/[id]/combats/route')
const { PATCH: patchCombat } = await import('@/app/api/sessions/[id]/combats/[combatId]/route')
const { POST: resolveRound } = await import(
  '@/app/api/sessions/[id]/combats/[combatId]/rounds/route'
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStartRequest(sessionId: number | string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${sessionId}/combats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchRequest(sessionId: number | string, combatId: number | string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/sessions/${sessionId}/combats/${combatId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

function makePatchParams(
  sessionId: number | string,
  combatId: number | string,
): { params: Promise<{ id: string; combatId: string }> } {
  return { params: Promise.resolve({ id: String(sessionId), combatId: String(combatId) }) }
}

function makeRoundRequest(
  sessionId: number | string,
  combatId: number | string,
  body: unknown,
): NextRequest {
  return new NextRequest(
    `http://localhost/api/sessions/${sessionId}/combats/${combatId}/rounds`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

function makeStartParams(sessionId: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(sessionId) }) }
}

function makeRoundParams(
  sessionId: number | string,
  combatId: number | string,
): { params: Promise<{ id: string; combatId: string }> } {
  return { params: Promise.resolve({ id: String(sessionId), combatId: String(combatId) }) }
}

/**
 * Seeds a minimal Grail Quest session + character, returning their IDs.
 */
function seedSession(opts?: {
  stats?: Record<string, unknown>
  initialStats?: Record<string, unknown>
}): { sessionId: number } {
  testDb
    .insert(sessions)
    .values({ gameSystemId: 'grail-quest', bookTitle: 'Test Adventure' })
    .run()

  const session = testDb.select().from(sessions).all().at(-1)!
  const sessionId = session.id

  testDb
    .insert(characters)
    .values({
      sessionId,
      stats: opts?.stats ?? { lifePoints: 12, experiencePoints: 0 },
      initialStats: opts?.initialStats ?? { lifePoints: 12, lifePointsXpBonuses: 0 },
    })
    .run()

  return { sessionId }
}

/**
 * Seeds a session with an in-progress combat already created.
 */
function seedSessionWithCombat(opts?: {
  characterStats?: Record<string, unknown>
  characterInitialStats?: Record<string, unknown>
  enemyLifePoints?: number
  enemyXp?: number
}): { sessionId: number; combatId: number } {
  const { sessionId } = seedSession({
    stats: opts?.characterStats,
    initialStats: opts?.characterInitialStats,
  })

  testDb
    .insert(combats)
    .values({
      sessionId,
      enemyName: 'Goblin',
      enemyStats: { name: 'Goblin', lifePoints: opts?.enemyLifePoints ?? 6, xp: opts?.enemyXp ?? 5 },
      enemyState: { currentLifePoints: opts?.enemyLifePoints ?? 6 },
      metadata: {
        initiativeWinner: 'player',
        playerRoll: 8,
        enemyRoll: 5,
        combatModifiers: {},
        enemyXp: opts?.enemyXp ?? 5,
        playerThreshold: 4,
      },
      outcome: 'in_progress',
    })
    .run()

  const combat = testDb
    .select()
    .from(combats)
    .where(eq(combats.sessionId, sessionId))
    .get()!

  return { sessionId, combatId: combat.id }
}

function readCharacter(sessionId: number) {
  return testDb.select().from(characters).where(eq(characters.sessionId, sessionId)).get()!
}

function readCombat(combatId: number) {
  return testDb.select().from(combats).where(eq(combats.id, combatId)).get()!
}

function readRoundsForCombat(combatId: number) {
  return testDb.select().from(combatRounds).where(eq(combatRounds.combatId, combatId)).all()
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Combat persistence integration', () => {
  beforeEach(() => {
    testDb.delete(combatRounds).run()
    testDb.delete(combats).run()
    testDb.delete(characters).run()
    testDb.delete(sessions).run()
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/combats — start combat
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/combats (start combat)', () => {
    it('creates a combat record with in_progress outcome and correct initial state', async () => {
      const { sessionId } = seedSession()

      const response = await startCombat(
        makeStartRequest(sessionId, { name: 'Goblin', lifePoints: 6, xp: 5 }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as Record<string, unknown>
      expect(body.outcome).toBe('in_progress')
      expect(body.enemyName).toBe('Goblin')
      expect(body.id).toBeTypeOf('number')

      // Verify persisted in DB.
      const saved = testDb
        .select()
        .from(combats)
        .where(eq(combats.sessionId, sessionId))
        .get()!
      expect(saved.outcome).toBe('in_progress')
      expect(saved.enemyName).toBe('Goblin')
      const savedState = saved.enemyState as Record<string, unknown>
      expect(savedState.currentLifePoints).toBe(6)
    })

    it('returns 409 when a combat is already in progress for the session', async () => {
      const { sessionId } = seedSessionWithCombat()

      const response = await startCombat(
        makeStartRequest(sessionId, { name: 'Troll', lifePoints: 10 }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(409)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/already in progress/i)
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await startCombat(
        makeStartRequest(99999, { name: 'Goblin', lifePoints: 6 }),
        makeStartParams(99999),
      )

      expect(response.status).toBe(404)
    })

    it('returns 400 when enemy stats are invalid (missing name)', async () => {
      const { sessionId } = seedSession()

      const response = await startCombat(
        makeStartRequest(sessionId, { lifePoints: 6 }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string; details: string[] }
      expect(body.error).toMatch(/invalid enemy stats/i)
      expect(body.details).toContain('name is required')
    })

    it('returns 400 when enemy stats are invalid (missing lifePoints)', async () => {
      const { sessionId } = seedSession()

      const response = await startCombat(
        makeStartRequest(sessionId, { name: 'Goblin' }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string; details: string[] }
      expect(body.details).toContain('lifePoints must be a positive integer')
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/combats/[combatId]/rounds — resolve round
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/combats/[combatId]/rounds (resolve round)', () => {
    it('resolving a round with override damage persists the updated LP to DB and response reflects the new value', async () => {
      const { sessionId, combatId } = seedSessionWithCombat({
        characterStats: { lifePoints: 12, experiencePoints: 0 },
        enemyLifePoints: 10,
      })

      // Use overrides to make the round deterministic: player takes 2 damage.
      const response = await resolveRound(
        makeRoundRequest(sessionId, combatId, {
          overrides: { damageTaken: 2, damageDealt: 0 },
        }),
        makeRoundParams(sessionId, combatId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as {
        round: Record<string, unknown>
        combat: Record<string, unknown>
        characterStats: Record<string, unknown>
      }
      expect(body.characterStats.lifePoints).toBe(10)
      expect(body.combat.outcome).toBe('in_progress')

      // Verify DB reflects the new LP.
      const saved = readCharacter(sessionId)
      expect((saved.stats as Record<string, unknown>).lifePoints).toBe(10)

      // A combat round row should have been inserted.
      const rounds = readRoundsForCombat(combatId)
      expect(rounds).toHaveLength(1)
      expect(rounds[0]!.roundNumber).toBe(1)
      expect(rounds[0]!.damageTaken).toBe(2)
    })

    it('winning a combat awards XP, persists it, and response carries updated characterStats', async () => {
      const { sessionId, combatId } = seedSessionWithCombat({
        characterStats: { lifePoints: 12, experiencePoints: 0 },
        enemyLifePoints: 3,
        enemyXp: 10,
      })

      // Override: deal enough damage to kill the enemy (3 LP), player takes 0.
      const response = await resolveRound(
        makeRoundRequest(sessionId, combatId, {
          overrides: { damageDealt: 3, damageTaken: 0 },
        }),
        makeRoundParams(sessionId, combatId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as {
        combat: Record<string, unknown>
        characterStats: Record<string, unknown>
      }
      expect(body.combat.outcome).toBe('player_won')
      expect(body.characterStats.experiencePoints).toBe(10)

      // Verify DB persisted the XP.
      const saved = readCharacter(sessionId)
      expect((saved.stats as Record<string, unknown>).experiencePoints).toBe(10)

      // Combat row must be closed.
      const savedCombat = readCombat(combatId)
      expect(savedCombat.outcome).toBe('player_won')
      expect(savedCombat.endedAt).toBeTruthy()
    })

    it('winning with XP that crosses a 20-XP threshold raises LP max in initialStats', async () => {
      const { sessionId, combatId } = seedSessionWithCombat({
        characterStats: { lifePoints: 12, experiencePoints: 15 },
        characterInitialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
        enemyLifePoints: 2,
        enemyXp: 10,
      })

      // 15 + 10 = 25 XP → crosses the 20-XP threshold → +1 LP max
      const response = await resolveRound(
        makeRoundRequest(sessionId, combatId, {
          overrides: { damageDealt: 2, damageTaken: 0 },
        }),
        makeRoundParams(sessionId, combatId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as {
        characterInitialStats: Record<string, unknown>
        characterStats: Record<string, unknown>
      }
      expect(body.characterStats.experiencePoints).toBe(25)
      expect(body.characterInitialStats.lifePoints).toBe(13)   // +1 from threshold
      expect(body.characterInitialStats.lifePointsXpBonuses).toBe(1)

      // Verify DB reflects the raised LP max.
      const saved = readCharacter(sessionId)
      expect((saved.initialStats as Record<string, unknown>).lifePoints).toBe(13)
    })

    it('a round that reduces LP to 0 sets player_lost outcome and persists game-over state', async () => {
      const { sessionId, combatId } = seedSessionWithCombat({
        characterStats: { lifePoints: 2, experiencePoints: 0 },
        enemyLifePoints: 10,
      })

      // Override: player takes lethal damage.
      const response = await resolveRound(
        makeRoundRequest(sessionId, combatId, {
          overrides: { damageDealt: 0, damageTaken: 2 },
        }),
        makeRoundParams(sessionId, combatId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as {
        combat: Record<string, unknown>
        characterStats: Record<string, unknown>
      }
      expect(body.combat.outcome).toBe('player_lost')
      expect(body.characterStats.lifePoints).toBe(0)

      // DB must reflect the terminal state.
      const savedCombat = readCombat(combatId)
      expect(savedCombat.outcome).toBe('player_lost')
      expect(savedCombat.endedAt).toBeTruthy()

      const savedChar = readCharacter(sessionId)
      expect((savedChar.stats as Record<string, unknown>).lifePoints).toBe(0)
    })

    it('round number increments correctly across multiple rounds', async () => {
      const { sessionId, combatId } = seedSessionWithCombat({
        characterStats: { lifePoints: 20, experiencePoints: 0 },
        enemyLifePoints: 20,
      })

      // Resolve two rounds — neither kills anyone.
      for (const _ of [1, 2]) {
        const resp = await resolveRound(
          makeRoundRequest(sessionId, combatId, {
            overrides: { damageDealt: 1, damageTaken: 1 },
          }),
          makeRoundParams(sessionId, combatId),
        )
        expect(resp.status).toBe(201)
      }

      const rounds = readRoundsForCombat(combatId)
      expect(rounds).toHaveLength(2)
      expect(rounds[0]!.roundNumber).toBe(1)
      expect(rounds[1]!.roundNumber).toBe(2)
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await resolveRound(
        makeRoundRequest(99999, 1, {}),
        makeRoundParams(99999, 1),
      )

      expect(response.status).toBe(404)
    })

    it('returns 404 when the combat does not exist', async () => {
      const { sessionId } = seedSession()

      const response = await resolveRound(
        makeRoundRequest(sessionId, 99999, {}),
        makeRoundParams(sessionId, 99999),
      )

      expect(response.status).toBe(404)
    })

    it('returns 409 when the combat is no longer in progress', async () => {
      const { sessionId } = seedSession()

      // Insert a completed combat directly.
      testDb
        .insert(combats)
        .values({
          sessionId,
          enemyName: 'Goblin',
          enemyStats: { name: 'Goblin', lifePoints: 6 },
          enemyState: { currentLifePoints: 0 },
          metadata: { initiativeWinner: 'player', playerRoll: 8, enemyRoll: 5, combatModifiers: {}, enemyXp: 5, playerThreshold: 4 },
          outcome: 'player_won',
        })
        .run()

      const combat = testDb.select().from(combats).where(eq(combats.sessionId, sessionId)).get()!

      const response = await resolveRound(
        makeRoundRequest(sessionId, combat.id, {}),
        makeRoundParams(sessionId, combat.id),
      )

      expect(response.status).toBe(409)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/no longer in progress/i)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/sessions/[id]/combats/[combatId] — player_fled (override-commit)
  // -------------------------------------------------------------------------

  describe('PATCH /api/sessions/[id]/combats/[combatId] (player fled)', () => {
    it('sets outcome to player_fled and returns the updated combat', async () => {
      const { sessionId, combatId } = seedSessionWithCombat()

      const response = await patchCombat(
        makePatchRequest(sessionId, combatId, { outcome: 'player_fled' }),
        makePatchParams(sessionId, combatId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Record<string, unknown>
      expect(body.outcome).toBe('player_fled')

      // DB must reflect the final outcome.
      const saved = readCombat(combatId)
      expect(saved.outcome).toBe('player_fled')
      expect(saved.endedAt).toBeTruthy()
    })

    it('returns 400 when trying to set outcome to player_won directly', async () => {
      const { sessionId, combatId } = seedSessionWithCombat()

      const response = await patchCombat(
        makePatchRequest(sessionId, combatId, { outcome: 'player_won' }),
        makePatchParams(sessionId, combatId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/cannot be set directly/i)
    })

    it('returns 400 when trying to set outcome to player_lost directly', async () => {
      const { sessionId, combatId } = seedSessionWithCombat()

      const response = await patchCombat(
        makePatchRequest(sessionId, combatId, { outcome: 'player_lost' }),
        makePatchParams(sessionId, combatId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/cannot be set directly/i)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/combats — initiative paths
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/combats — initiative paths', () => {
    it('honours initiativeMode player: initiativeWinner is player in metadata', async () => {
      const { sessionId } = seedSession()

      const response = await startCombat(
        makeStartRequest(sessionId, { name: 'Goblin', lifePoints: 6, xp: 5, initiativeMode: 'player' }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as Record<string, unknown>
      const metadata = body.metadata as Record<string, unknown>
      expect(metadata.initiativeWinner).toBe('player')
    })

    it('honours initiativeMode enemy: initiativeWinner is enemy in metadata', async () => {
      const { sessionId } = seedSession()

      const response = await startCombat(
        makeStartRequest(sessionId, { name: 'Goblin', lifePoints: 6, xp: 5, initiativeMode: 'enemy' }),
        makeStartParams(sessionId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as Record<string, unknown>
      const metadata = body.metadata as Record<string, unknown>
      expect(metadata.initiativeWinner).toBe('enemy')
    })
  })
})
