import { NextRequest, NextResponse } from 'next/server'
import '../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../lib/game-systems/registry'
import { db } from '../../../../lib/db'
import { sessions, characters } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
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

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    return NextResponse.json({
      session: {
        id: session.id,
        bookTitle: session.bookTitle,
        gameSystemId: session.gameSystemId,
        gameSystemName: gameSystem.name,
      },
      character: {
        stats: character.stats,
        initialStats: character.initialStats,
      },
      gameSystem: {
        stats: gameSystem.stats.map((s) => ({ key: s.key, label: s.label })),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
