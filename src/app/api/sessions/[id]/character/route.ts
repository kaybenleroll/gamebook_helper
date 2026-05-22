import { NextRequest, NextResponse } from 'next/server'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { db } from '../../../../../lib/db'
import { sessions, characters } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const body = await request.json() as { stat?: unknown; delta?: unknown }
    const { stat, delta } = body
    if (!stat || typeof stat !== 'string' || typeof delta !== 'number') {
      return NextResponse.json({ error: 'stat (string) and delta (number) are required' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    const statDef = gameSystem.stats.find((s) => s.key === stat)
    if (!statDef) {
      return NextResponse.json({ error: `Unknown stat: ${stat}` }, { status: 400 })
    }

    const currentValue = (character.stats as Record<string, number>)[stat] ?? statDef.min
    const newValue = Math.max(statDef.min, Math.min(statDef.max ?? Infinity, currentValue + delta))
    const newStats = { ...(character.stats as Record<string, number>), [stat]: newValue }

    db.update(characters).set({ stats: newStats }).where(eq(characters.sessionId, sessionId)).run()

    return NextResponse.json({ stats: newStats })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
