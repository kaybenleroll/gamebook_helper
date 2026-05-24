/**
 * Integration tests for inventory routes:
 *   GET  /api/sessions/[id]/inventory           — list inventory items
 *   POST /api/sessions/[id]/inventory           — add an item
 *
 * Grail Quest is used as the test game system (defines Healing Potion + Salve).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { sessions, inventoryItems } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// In-memory database bootstrap
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

const { GET: listInventory, POST: addItem } = await import('@/app/api/sessions/[id]/inventory/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

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

function seedGqSession(): { sessionId: number } {
  testDb.insert(sessions).values({ gameSystemId: 'grail-quest', bookTitle: 'Test Adventure' }).run()
  const session = testDb.select().from(sessions).all().at(-1)!
  return { sessionId: session.id }
}

function readItemsForSession(sessionId: number) {
  return testDb.select().from(inventoryItems).where(eq(inventoryItems.sessionId, sessionId)).all()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Inventory integration', () => {
  beforeEach(() => {
    testDb.delete(inventoryItems).run()
    testDb.delete(sessions).run()
  })

  // -------------------------------------------------------------------------
  // GET /api/sessions/[id]/inventory
  // -------------------------------------------------------------------------

  describe('GET /api/sessions/[id]/inventory', () => {
    it('auto-seeds default consumables from the game system on first fetch', async () => {
      // GQ defines: 3 Healing Potions + 1 Salve
      const { sessionId } = seedGqSession()

      const response = await listInventory(
        makeGetRequest(`http://localhost/api/sessions/${sessionId}/inventory`),
        makeParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Array<Record<string, unknown>>

      // 3 Healing Potions + 1 Salve = 4 items
      expect(body.length).toBe(4)
      const healingPotions = body.filter((i) => i['name'] === 'Healing Potion')
      const salves = body.filter((i) => i['name'] === 'Salve')
      expect(healingPotions).toHaveLength(3)
      expect(salves).toHaveLength(1)

      // Each item must have required fields
      expect(typeof body[0]!['id']).toBe('number')
      expect(typeof body[0]!['name']).toBe('string')
    })

    it('returns existing items without re-seeding on subsequent fetches', async () => {
      const { sessionId } = seedGqSession()

      // Seed one item manually — subsequent fetch should not re-seed defaults
      testDb.insert(inventoryItems).values({
        sessionId,
        name: 'Magic Key',
        quantity: 1,
        isSpecial: true,
        itemType: 'item',
      }).run()

      const response = await listInventory(
        makeGetRequest(`http://localhost/api/sessions/${sessionId}/inventory`),
        makeParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Array<Record<string, unknown>>

      // Only the manually seeded item — not the 4 GQ defaults
      expect(body).toHaveLength(1)
      expect(body[0]!['name']).toBe('Magic Key')
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await listInventory(
        makeGetRequest('http://localhost/api/sessions/99999/inventory'),
        makeParams(99999),
      )

      expect(response.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/inventory — pick up an item
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/inventory', () => {
    it('creates a new item and returns it with status 201', async () => {
      const { sessionId } = seedGqSession()

      const response = await addItem(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/inventory`, {
          name: 'Gold Key',
          quantity: 1,
          isSpecial: false,
        }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as Record<string, unknown>
      expect(body['name']).toBe('Gold Key')
      expect(body['quantity']).toBe(1)
      expect(typeof body['id']).toBe('number')

      // Verify persisted in DB
      const items = readItemsForSession(sessionId)
      expect(items).toHaveLength(1)
      expect(items[0]!.name).toBe('Gold Key')
    })

    it('defaults quantity to 1 when not provided', async () => {
      const { sessionId } = seedGqSession()

      const response = await addItem(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/inventory`, { name: 'Torch' }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(201)
      const body = await response.json() as Record<string, unknown>
      expect(body['quantity']).toBe(1)
    })

    it('returns 400 with Zod details when name is missing', async () => {
      const { sessionId } = seedGqSession()

      const response = await addItem(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/inventory`, { quantity: 2 }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string; details: unknown[] }
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    it('returns 400 with Zod details when quantity is not a positive integer', async () => {
      const { sessionId } = seedGqSession()

      const response = await addItem(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/inventory`, { name: 'Rope', quantity: 0 }),
        makeParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string; details: unknown[] }
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    it('returns 400 with Zod details when body is not an object', async () => {
      const { sessionId } = seedGqSession()

      const response = await addItem(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/inventory`, 'invalid'),
        makeParams(sessionId),
      )

      expect(response.status).toBe(400)
      const body = await response.json() as { error: string; details: unknown[] }
      expect(body.error).toBe('Invalid request body')
      expect(body.details).toBeDefined()
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await addItem(
        makePostRequest('http://localhost/api/sessions/99999/inventory', { name: 'Key' }),
        makeParams(99999),
      )

      expect(response.status).toBe(404)
    })
  })
})
