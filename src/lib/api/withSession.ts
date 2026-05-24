import { NextResponse } from 'next/server'
import '@/lib/game-systems/index'
import { gameSystemRegistry } from '@/lib/game-systems/registry'
import { db } from '@/lib/db'
import { sessions, characters } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { GameSystem } from '@/lib/game-systems/types'

export interface SessionContext {
  session: typeof sessions.$inferSelect
  character: typeof characters.$inferSelect
  gameSystem: GameSystem
}

/**
 * Resolves the standard session/character/gameSystem prologue shared across
 * session-scoped route handlers.
 *
 * Returns a SessionContext on success, or a NextResponse error on failure:
 *   400 — session ID is not a valid integer
 *   404 — session not found
 *   404 — character not found
 *   500 — game system not registered
 *
 * Usage:
 *   const ctx = await resolveSession(params.id)
 *   if (ctx instanceof NextResponse) return ctx
 *   const { session, character, gameSystem } = ctx
 */
export async function resolveSession(
  sessionIdParam: string,
): Promise<SessionContext | NextResponse> {
  const sessionId = parseInt(sessionIdParam, 10)
  if (isNaN(sessionId)) {
    return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
  }

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
  if (!character) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  let gameSystem: GameSystem
  try {
    gameSystem = gameSystemRegistry.get(session.gameSystemId)
  } catch {
    return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
  }

  return { session, character, gameSystem }
}
