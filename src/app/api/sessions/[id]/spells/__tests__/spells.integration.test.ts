/**
 * Integration tests for spell routes:
 *   GET  /api/sessions/[id]/spells                       — list spells
 *   POST /api/sessions/[id]/spells/[spellId]/cast        — cast a spell
 *
 * Grail Quest is used as it defines spells (Lightning Bolt, Fireball).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { sessions, sessionSpells } from '@/lib/db/schema'

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

const { GET: listSpells } = await import('@/app/api/sessions/[id]/spells/route')
const { POST: castSpell } = await import('@/app/api/sessions/[id]/spells/[spellId]/cast/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

function makePostRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'POST' })
}

function makeSessionParams(sessionId: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(sessionId) }) }
}

function makeSpellParams(sessionId: number | string, spellId: string): { params: Promise<{ id: string; spellId: string }> } {
  return { params: Promise.resolve({ id: String(sessionId), spellId }) }
}

function seedGqSession(): { sessionId: number } {
  testDb.insert(sessions).values({ gameSystemId: 'grail-quest', bookTitle: 'Test Adventure' }).run()
  const session = testDb.select().from(sessions).all().at(-1)!
  return { sessionId: session.id }
}

function readSpell(sessionId: number, spellId: string) {
  return testDb
    .select()
    .from(sessionSpells)
    .where(and(eq(sessionSpells.sessionId, sessionId), eq(sessionSpells.spellId, spellId)))
    .get() ?? null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spells integration', () => {
  beforeEach(() => {
    testDb.delete(sessionSpells).run()
    testDb.delete(sessions).run()
  })

  // -------------------------------------------------------------------------
  // GET /api/sessions/[id]/spells
  // -------------------------------------------------------------------------

  describe('GET /api/sessions/[id]/spells', () => {
    it('auto-creates spell rows from the game system definition on first fetch', async () => {
      const { sessionId } = seedGqSession()

      const response = await listSpells(
        makeGetRequest(`http://localhost/api/sessions/${sessionId}/spells`),
        makeSessionParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Array<{ spellId: string; usesRemaining: number }>

      // GQ defines Lightning Bolt (10 uses) and Fireball (2 uses)
      expect(body.length).toBe(2)
      const lightningBolt = body.find((s) => s.spellId === 'lightning-bolt')
      const fireball = body.find((s) => s.spellId === 'fireball')
      expect(lightningBolt).toBeDefined()
      expect(lightningBolt!.usesRemaining).toBe(10)
      expect(fireball).toBeDefined()
      expect(fireball!.usesRemaining).toBe(2)
    })

    it('returns existing spell rows without recreating them on second fetch', async () => {
      const { sessionId } = seedGqSession()

      // Seed a spell manually with a custom use count
      testDb.insert(sessionSpells).values({ sessionId, spellId: 'lightning-bolt', usesRemaining: 7 }).run()
      testDb.insert(sessionSpells).values({ sessionId, spellId: 'fireball', usesRemaining: 1 }).run()

      const response = await listSpells(
        makeGetRequest(`http://localhost/api/sessions/${sessionId}/spells`),
        makeSessionParams(sessionId),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as Array<{ spellId: string; usesRemaining: number }>

      const lb = body.find((s) => s.spellId === 'lightning-bolt')!
      expect(lb.usesRemaining).toBe(7) // existing row not overwritten
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await listSpells(
        makeGetRequest('http://localhost/api/sessions/99999/spells'),
        makeSessionParams(99999),
      )

      expect(response.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/sessions/[id]/spells/[spellId]/cast
  // -------------------------------------------------------------------------

  describe('POST /api/sessions/[id]/spells/[spellId]/cast', () => {
    it('decrements usesRemaining by 1 and returns updated spell', async () => {
      const { sessionId } = seedGqSession()
      testDb.insert(sessionSpells).values({ sessionId, spellId: 'lightning-bolt', usesRemaining: 5 }).run()

      const response = await castSpell(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/spells/lightning-bolt/cast`),
        makeSpellParams(sessionId, 'lightning-bolt'),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { spellId: string; usesRemaining: number }
      expect(body.spellId).toBe('lightning-bolt')
      expect(body.usesRemaining).toBe(4)

      // Verify DB
      const saved = readSpell(sessionId, 'lightning-bolt')
      expect(saved!.usesRemaining).toBe(4)
    })

    it('allows casting until the last use (usesRemaining reaches 0)', async () => {
      const { sessionId } = seedGqSession()
      testDb.insert(sessionSpells).values({ sessionId, spellId: 'fireball', usesRemaining: 1 }).run()

      const response = await castSpell(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/spells/fireball/cast`),
        makeSpellParams(sessionId, 'fireball'),
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { usesRemaining: number }
      expect(body.usesRemaining).toBe(0)
    })

    it('returns 409 when no uses remain', async () => {
      const { sessionId } = seedGqSession()
      testDb.insert(sessionSpells).values({ sessionId, spellId: 'fireball', usesRemaining: 0 }).run()

      const response = await castSpell(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/spells/fireball/cast`),
        makeSpellParams(sessionId, 'fireball'),
      )

      expect(response.status).toBe(409)
      const body = await response.json() as { error: string }
      expect(body.error).toMatch(/no uses remaining/i)
    })

    it('returns 404 when the spell does not exist for the session', async () => {
      const { sessionId } = seedGqSession()

      const response = await castSpell(
        makePostRequest(`http://localhost/api/sessions/${sessionId}/spells/unknown-spell/cast`),
        makeSpellParams(sessionId, 'unknown-spell'),
      )

      expect(response.status).toBe(404)
    })

    it('returns 404 when the session does not exist', async () => {
      const response = await castSpell(
        makePostRequest('http://localhost/api/sessions/99999/spells/lightning-bolt/cast'),
        makeSpellParams(99999, 'lightning-bolt'),
      )

      expect(response.status).toBe(404)
    })
  })
})
