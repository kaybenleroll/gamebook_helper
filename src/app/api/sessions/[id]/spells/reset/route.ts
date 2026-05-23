import { NextRequest, NextResponse } from 'next/server'
import '../../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../../lib/game-systems/registry'
import { db } from '../../../../../../lib/db'
import { sessions, sessionSpells } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(
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

    for (const spell of spellDefs) {
      db.update(sessionSpells)
        .set({ usesRemaining: spell.maxUses })
        .where(and(eq(sessionSpells.sessionId, sessionId), eq(sessionSpells.spellId, spell.id)))
        .run()
    }

    const rows = db.select().from(sessionSpells).where(eq(sessionSpells.sessionId, sessionId)).all()

    return NextResponse.json(rows.map((r) => ({ spellId: r.spellId, usesRemaining: r.usesRemaining })))
  } catch (err) {
    console.error('[POST /api/sessions/[id]/spells/reset]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
