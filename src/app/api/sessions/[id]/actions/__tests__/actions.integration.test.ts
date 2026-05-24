/**
 * Integration tests for session action routes:
 *   POST /api/sessions/[id]/actions/eat-meal  — consume an inventory item
 *   POST /api/sessions/[id]/actions/test-luck — test luck stat (Fighting Fantasy)
 *
 * All tests use a real in-memory SQLite database (no mocks) so they exercise
 * the actual Drizzle ORM writes and game-system logic end-to-end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { sessions, characters, inventoryItems } from '@/lib/db/schema'

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

vi.mock('@/lib/db', () => ({ db: testDb }))

const { POST: eatMeal } = await import('@/app/api/sessions/[id]/actions/eat-meal/route')
const { POST: testLuck } = await import('@/app/api/sessions/[id]/actions/test-luck/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(sessionId: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(sessionId) }) }
}

/**
 * Seeds a Grail Quest session + character. Returns sessionId.
 */
function seedGqSession(opts?: { stats?: Record<string, unknown>; initialStats?: Record<string, unknown> }): { sessionId: number } {
  testDb.insert(sessions).values({ gameSystemId: 'grail-quest', bookTitle: 'Test Adventure' }).run()
  const session = testDb.select().from(sessions).all().at(-1)!
  const sessionId = session.id

  testDb.insert(characters).values({
    sessionId,
    stats: opts?.stats ?? { lifePoints: 12, experiencePoints: 0 },
    initialStats: opts?.initialStats ?? { lifePoints: 12, lifePointsXpBonuses: 0 },
  }).run()

  return { sessionId }
}

/**
 * Seeds a Fighting Fantasy session + character. Returns sessionId.
 */
function seedFfSession(opts?: { stats?: Record<string, unknown>; initialStats?: Record<string, unknown> }): { sessionId: number } {
  testDb.insert(sessions).values({ gameSystemId: 'fighting-fantasy', bookTitle: 'FF Adventure' }).run()
  const session = testDb.select().from(sessions).all().at(-1)!
  const sessionId = session.id

  testDb.insert(characters).values({
    sessionId,
    stats: opts?.stats ?? { skill: 10, stamina: 18, luck: 8 },
    initialStats: opts?.initialStats ?? { skill: 10, stamina: 18, luck: 8 },
  }).run()

  return { sessionId }
}

/**
 * Seeds an inventory item with a dose count. Returns the item id.
 */
function seedInventoryItem(sessionId: number, opts?: {
  name?: string
  itemType?: string
  doseCount?: number
  healAmount?: number
}): number {
  testDb.insert(inventoryItems).values({
    sessionId,
    name: opts?.name ?? 'Healing Potion',
    quantity: 1,
    isSpecial: false,
    itemType: opts?.itemType ?? 'potion',
    doseCount: opts?.doseCount ?? 3,
    healAmount: opts?.healAmount ?? null,
  }).run()

  const item = testDb.select().from(inventoryItems).where(eq(inventoryItems.sessionId, sessionId)).all().at(-1)!
  return item.id
}

function readCharacter(sessionId: number) {
  return testDb.select().from(characters).where(eq(characters.sessionId, sessionId)).get()!
}

function readItem(itemId: number) {
  return testDb.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).get() ?? null
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Actions integration', () => {
  beforeEach(() => {
    testDb.delete(inventoryItems).run()
    testDb.delete(characters).run()
    testDb.delete(sessions).run()
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/actions/eat-meal
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/actions/eat-meal', () => {
    it('applies heal amount stat delta and decrements dose count', async () => {
      // GQ Salve: healAmount 3 — use a salve with 5 doses on a character at 8 LP (max 12)
      const { sessionId } = seedGqSession({
        stats: { lifePoints: 8, experiencePoints: 0 },
        initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
      })
      const itemId = seedInventoryItem(sessionId, {
        name: 'Salve',
        itemType: 'salve',
        doseCount: 5,
        healAmount: 3,
      })

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, { itemId }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as {
        statDeltas: Record<string, number>
        message: string
        stats: Record<string, unknown>
        item: Record<string, unknown> | null
      }

      // LP should have increased by 3 (8 → 11)
      expect(body.statDeltas.lifePoints).toBe(3)
      expect(body.stats.lifePoints).toBe(11)
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)

      // Dose count should be decremented (5 → 4)
      expect(body.item).not.toBeNull()
      expect(body.item!.doseCount).toBe(4)

      // Verify DB was updated
      const saved = readCharacter(sessionId)
      expect((saved.stats as Record<string, unknown>).lifePoints).toBe(11)
    })

    it('deletes the item when the last dose is consumed', async () => {
      const { sessionId } = seedGqSession({
        stats: { lifePoints: 8, experiencePoints: 0 },
        initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
      })
      const itemId = seedInventoryItem(sessionId, {
        name: 'Salve',
        itemType: 'salve',
        doseCount: 1,
        healAmount: 3,
      })

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, { itemId }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { item: null }

      // Item should be null in the response (consumed completely)
      expect(body.item).toBeNull()

      // Item should be deleted from DB
      expect(readItem(itemId)).toBeNull()
    })

    it('caps LP at the initial max when heal would exceed it', async () => {
      // LP is 11 / max 12 — heal 3 should cap at 12, not go to 14
      const { sessionId } = seedGqSession({
        stats: { lifePoints: 11, experiencePoints: 0 },
        initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
      })
      const itemId = seedInventoryItem(sessionId, {
        name: 'Salve',
        itemType: 'salve',
        doseCount: 2,
        healAmount: 3,
      })

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, { itemId }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { statDeltas: Record<string, number>; stats: Record<string, unknown> }
      // Actual heal capped at 1 (12 − 11)
      expect(body.statDeltas.lifePoints).toBe(1)
      expect(body.stats.lifePoints).toBe(12)
    })

    it('returns 404 when the item does not belong to the session', async () => {
      const { sessionId } = seedGqSession()
      const { sessionId: otherId } = seedGqSession()
      const itemId = seedInventoryItem(otherId, { doseCount: 3 })

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, { itemId }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(404)
    })

    it('returns 409 when no doses remain', async () => {
      const { sessionId } = seedGqSession()
      const itemId = seedInventoryItem(sessionId, { doseCount: 0 })

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, { itemId }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(409)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/no doses/i)
    })

    it('returns 400 when itemId is missing', async () => {
      const { sessionId } = seedGqSession()

      const response = await eatMeal(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/eat-meal`, {}),
        makeParams(sessionId),
      )

      expect(response.status).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/actions/test-luck (Fighting Fantasy)
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/actions/test-luck', () => {
    it('decrements luck by 1 on a lucky outcome and returns correct response shape', async () => {
      // Force a successful luck test: luck=8, roll will be ≤ 8.
      // We control the roll via Math.random — force dice to show [2,2]=4, which is ≤ 8 → lucky.
      const { sessionId } = seedFfSession({
        stats: { skill: 10, stamina: 18, luck: 8 },
        initialStats: { skill: 10, stamina: 18, luck: 8 },
      })

      // Force dice to produce roll 4 (≤ luck 8) → lucky outcome
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue((2 - 1) / 6) // die face 2
      try {
        const response = await testLuck(
          makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/test-luck`, {}),
          makeParams(sessionId),
        )

        expect(response.status).toBe(200)
        const body = await response.json() as {
          roll: number
          success: boolean
          newLuck: number
          message: string
          stats: Record<string, unknown>
          initialStats: Record<string, unknown>
        }

        // Roll is 4 (2+2), luck is 8 → lucky
        expect(body.roll).toBe(4)
        expect(body.success).toBe(true)
        // Luck always decrements by 1 regardless of outcome
        expect(body.newLuck).toBe(7)
        expect(body.stats.luck).toBe(7)
        expect(typeof body.message).toBe('string')
        expect(body.message.length).toBeGreaterThan(0)

        // Verify DB was updated
        const saved = readCharacter(sessionId)
        expect((saved.stats as Record<string, unknown>).luck).toBe(7)
      } finally {
        mathRandomSpy.mockRestore()
      }
    })

    it('decrements luck by 1 on an unlucky outcome', async () => {
      // Luck=6, force roll 11 (> 6) → unlucky but luck still decrements
      const { sessionId } = seedFfSession({
        stats: { skill: 10, stamina: 18, luck: 6 },
        initialStats: { skill: 10, stamina: 18, luck: 6 },
      })

      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue((6 - 1) / 6) // die face 6 → roll 12
      try {
        const response = await testLuck(
          makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/test-luck`, {}),
          makeParams(sessionId),
        )

        expect(response.status).toBe(200)
        const body = await response.json() as {
          roll: number
          success: boolean
          newLuck: number
          stats: Record<string, unknown>
        }

        // Roll 12 > luck 6 → unlucky
        expect(body.success).toBe(false)
        // Luck still decrements by 1
        expect(body.newLuck).toBe(5)
        expect(body.stats.luck).toBe(5)

        // Verify DB
        const saved = readCharacter(sessionId)
        expect((saved.stats as Record<string, unknown>).luck).toBe(5)
      } finally {
        mathRandomSpy.mockRestore()
      }
    })

    it('returns 409 when luck is 0', async () => {
      const { sessionId } = seedFfSession({
        stats: { skill: 10, stamina: 18, luck: 0 },
        initialStats: { skill: 10, stamina: 18, luck: 8 },
      })

      const response = await testLuck(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/test-luck`, {}),
        makeParams(sessionId),
      )

      expect(response.status).toBe(409)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/luck.*0/i)
    })

    it('returns 404 when session does not exist', async () => {
      const response = await testLuck(
        makePostRequest('http://localhost/api/sessions/99999/actions/test-luck', {}),
        makeParams(99999),
      )

      expect(response.status).toBe(404)
    })

    it('returns 400 when game system does not support test-luck', async () => {
      // Grail Quest does not have a testLuck function
      const { sessionId } = seedGqSession()

      const response = await testLuck(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/actions/test-luck`, {}),
        makeParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/does not support/i)
    })
  })
})
