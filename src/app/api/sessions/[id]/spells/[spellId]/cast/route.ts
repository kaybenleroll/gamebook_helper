import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../../lib/db'
import { sessions, sessionSpells } from '../../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; spellId: string }> },
): Promise<NextResponse> {
  try {
    const { id, spellId } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const row = db
      .select()
      .from(sessionSpells)
      .where(and(eq(sessionSpells.sessionId, sessionId), eq(sessionSpells.spellId, spellId)))
      .get()

    if (!row) {
      return NextResponse.json({ error: 'Spell not found for this session' }, { status: 404 })
    }

    if (row.usesRemaining <= 0) {
      return NextResponse.json({ error: 'No uses remaining' }, { status: 409 })
    }

    db.update(sessionSpells)
      .set({ usesRemaining: row.usesRemaining - 1 })
      .where(and(eq(sessionSpells.sessionId, sessionId), eq(sessionSpells.spellId, spellId)))
      .run()

    const updated = db
      .select()
      .from(sessionSpells)
      .where(and(eq(sessionSpells.sessionId, sessionId), eq(sessionSpells.spellId, spellId)))
      .get()!

    return NextResponse.json({ spellId: updated.spellId, usesRemaining: updated.usesRemaining })
  } catch (err) {
    console.error('[POST /api/sessions/[id]/spells/[spellId]/cast]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
