/**
 * Unit tests for the resolveSession helper in withSession.ts.
 *
 * Uses an isolated in-memory SQLite database (same pattern as other integration
 * tests in this project) so the helper's DB calls exercise real Drizzle ORM
 * behaviour without touching the production database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { sessions, characters } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Bootstrap an isolated in-memory database via vi.hoisted so the same
// instance is available inside the vi.mock factory and in the test body.
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
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS characters_session_id_idx ON characters(session_id);
  `)

  const testDb = drizzle(sqlite)
  return { testDb }
})

vi.mock('@/lib/db', () => ({ db: testDb }))

const { resolveSession } = await import('@/lib/api/withSession')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedSession(gameSystemId: string): number {
  testDb.insert(sessions).values({ gameSystemId, bookTitle: 'Test Book' }).run()
  return testDb.select().from(sessions).all().at(-1)!.id
}

function seedCharacter(sessionId: number): void {
  testDb.insert(characters).values({
    sessionId,
    stats: { lifePoints: 10 },
    initialStats: { lifePoints: 10 },
  }).run()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSession', () => {
  beforeEach(() => {
    testDb.delete(characters).run()
    testDb.delete(sessions).run()
  })

  it('returns SessionContext when session, character, and game system all exist', async () => {
    const sessionId = seedSession('grail-quest')
    seedCharacter(sessionId)

    const result = await resolveSession(String(sessionId))

    expect(result).not.toBeInstanceOf(NextResponse)
    const ctx = result as Awaited<ReturnType<typeof resolveSession>>
    if (ctx instanceof NextResponse) throw new Error('unreachable')
    expect(ctx.session.id).toBe(sessionId)
    expect(ctx.character.sessionId).toBe(sessionId)
    expect(ctx.gameSystem.id).toBe('grail-quest')
  })

  it('returns 400 for a non-numeric session ID', async () => {
    const result = await resolveSession('not-a-number')

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Invalid session ID')
  })

  it('returns 404 when session does not exist', async () => {
    const result = await resolveSession('9999')

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Session not found')
  })

  it('returns 404 when character does not exist for the session', async () => {
    const sessionId = seedSession('grail-quest')
    // No character seeded

    const result = await resolveSession(String(sessionId))

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Character not found')
  })

  it('returns 500 when game system is not registered', async () => {
    const sessionId = seedSession('unknown-system-xyz')
    seedCharacter(sessionId)

    const result = await resolveSession(String(sessionId))

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(500)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Unknown game system')
  })
})
