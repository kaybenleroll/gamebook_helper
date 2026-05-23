/**
 * Integration tests for DELETE /api/sessions/[id]
 *
 * These tests use a real in-memory SQLite database (not a mock) to verify
 * that the handler correctly cascade-deletes all FK-linked rows when a
 * session is removed.  The production SQLite engine, Drizzle ORM, and FK
 * constraint enforcement are all exercised.
 *
 * Background: a missing cascade in a previous deployment caused a 500.
 * These tests would have caught that regression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import {
  sessions,
  characters,
  maps,
  combats,
  combatRounds,
  sectionVisits,
  inventoryItems,
  sessionSpells,
} from '@/lib/db/schema'
import { createTestDb, seedSessionWithRelatedData } from '@/lib/test-helpers/db'

// ---------------------------------------------------------------------------
// Create the shared in-memory database using vi.hoisted so it is available
// both inside the vi.mock factory (which is hoisted above imports) and in
// the test body.
// ---------------------------------------------------------------------------

const { testDb } = vi.hoisted(() => {
  // We cannot import the createTestDb helper here because vi.hoisted runs
  // before any module imports.  Instead we bootstrap the SQLite database
  // inline so both the mock factory and the tests share the same instance.
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
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      panel_order TEXT
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

// Replace the production db singleton with our in-memory test database.
vi.mock('@/lib/db', () => ({ db: testDb }))

// Import the handler AFTER the mock is registered so it receives testDb.
const { DELETE } = await import('@/app/api/sessions/[id]/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteRequest(sessionId: number | string): NextRequest {
  return new NextRequest(`http://localhost/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

function makeParams(sessionId: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(sessionId) }) }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DELETE /api/sessions/[id]', () => {
  let seeded: Awaited<ReturnType<typeof seedSessionWithRelatedData>>

  beforeEach(async () => {
    // Each test starts with a freshly seeded session and all related rows.
    seeded = await seedSessionWithRelatedData(testDb)
  })

  // -----------------------------------------------------------------------
  // Happy path — response status
  // -----------------------------------------------------------------------

  it('returns 204 No Content for a valid session', async () => {
    const response = await DELETE(
      makeDeleteRequest(seeded.sessionId),
      makeParams(seeded.sessionId),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  // -----------------------------------------------------------------------
  // Happy path — database state after delete
  // -----------------------------------------------------------------------

  it('removes the session row from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(sessions)
      .where(eq(sessions.id, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes the character row from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(characters)
      .where(eq(characters.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all map rows from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(maps)
      .where(eq(maps.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all combat rows from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(combats)
      .where(eq(combats.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all combat round rows — no orphaned rounds remain', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(combatRounds)
      .where(eq(combatRounds.combatId, seeded.combatId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all section visit rows from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(sectionVisits)
      .where(eq(sectionVisits.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all inventory item rows from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  it('removes all session spell rows from the database', async () => {
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    const remaining = testDb
      .select()
      .from(sessionSpells)
      .where(eq(sessionSpells.sessionId, seeded.sessionId))
      .all()

    expect(remaining).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // Error paths
  // -----------------------------------------------------------------------

  it('returns 404 when session does not exist — not a 500', async () => {
    const nonExistentId = 999999

    const response = await DELETE(
      makeDeleteRequest(nonExistentId),
      makeParams(nonExistentId),
    )

    expect(response.status).toBe(404)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 400 for a non-numeric session ID', async () => {
    const response = await DELETE(
      makeDeleteRequest('not-a-number'),
      makeParams('not-a-number'),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as { error: string }
    expect(body.error).toMatch(/invalid session id/i)
  })

  // -----------------------------------------------------------------------
  // Isolation: unrelated sessions are unaffected
  // -----------------------------------------------------------------------

  it('does not remove rows belonging to a different session', async () => {
    // Seed a second independent session.
    const second = await seedSessionWithRelatedData(testDb)

    // Delete only the first session.
    await DELETE(makeDeleteRequest(seeded.sessionId), makeParams(seeded.sessionId))

    // The second session and its character must still exist.
    const remainingSession = testDb
      .select()
      .from(sessions)
      .where(eq(sessions.id, second.sessionId))
      .get()

    const remainingCharacter = testDb
      .select()
      .from(characters)
      .where(eq(characters.sessionId, second.sessionId))
      .get()

    expect(remainingSession).toBeDefined()
    expect(remainingCharacter).toBeDefined()
  })
})
