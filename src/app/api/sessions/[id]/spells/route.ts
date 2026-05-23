import { NextRequest, NextResponse } from 'next/server'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { db } from '../../../../../lib/db'
import { sessions, sessionSpells } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

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

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 404 })
    }

    const spellDefs = gameSystem.spells ?? []

    let rows = db.select().from(sessionSpells).where(eq(sessionSpells.sessionId, sessionId)).all()

    if (rows.length === 0 && spellDefs.length > 0) {
      for (const spell of spellDefs) {
        db.insert(sessionSpells)
          .values({ sessionId, spellId: spell.id, usesRemaining: spell.maxUses })
          .run()
      }
      rows = db.select().from(sessionSpells).where(eq(sessionSpells.sessionId, sessionId)).all()
    }

    return NextResponse.json(rows.map((r) => ({ spellId: r.spellId, usesRemaining: r.usesRemaining })))
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/spells] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
