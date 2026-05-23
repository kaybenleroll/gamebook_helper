import { NextRequest, NextResponse } from 'next/server'
import '../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../lib/game-systems/registry'
import { db } from '../../../../lib/db'
import { sessions, characters, maps, combats, combatRounds, sectionVisits } from '../../../../lib/db/schema'
import { eq, inArray } from 'drizzle-orm'

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
        creationRolls: character.creationRolls ?? null,
      },
      gameSystem: {
        stats: gameSystem.stats.map((s) => ({ key: s.key, label: s.label })),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    const body = await request.json() as { bookTitle?: unknown; notes?: unknown; panelOrder?: unknown }
    const { bookTitle, notes, panelOrder } = body

    if (bookTitle !== undefined && (typeof bookTitle !== 'string' || bookTitle.trim() === '')) {
      return NextResponse.json({ error: 'bookTitle must be a non-empty string' }, { status: 400 })
    }

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 })
    }

    if (panelOrder !== undefined) {
      if (!Array.isArray(panelOrder) || !panelOrder.every((item) => typeof item === 'string')) {
        return NextResponse.json({ error: 'panelOrder must be an array of strings' }, { status: 400 })
      }
    }

    if (bookTitle === undefined && notes === undefined && panelOrder === undefined) {
      return NextResponse.json({ error: 'At least one field (bookTitle, notes, or panelOrder) must be provided' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updateFields: {
      updatedAt: Date
      bookTitle?: string
      notes?: string | null
      panelOrder?: string | null
    } = { updatedAt: new Date() }
    if (bookTitle !== undefined) updateFields.bookTitle = (bookTitle as string).trim()
    if (notes !== undefined) updateFields.notes = notes === '' ? null : (notes as string)
    if (panelOrder !== undefined) updateFields.panelOrder = JSON.stringify(panelOrder)

    db.update(sessions)
      .set(updateFields)
      .where(eq(sessions.id, sessionId))
      .run()

    const updatedSession = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()!

    return NextResponse.json({
      id: sessionId,
      bookTitle: updatedSession.bookTitle,
      notes: updatedSession.notes ?? null,
      panelOrder: updatedSession.panelOrder ? JSON.parse(updatedSession.panelOrder) as string[] : null,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    db.transaction((tx) => {
      const sessionCombats = tx.select({ id: combats.id }).from(combats).where(eq(combats.sessionId, sessionId)).all()

      const combatIds = sessionCombats.map((c) => c.id)

      if (combatIds.length > 0) {
        tx.delete(combatRounds).where(inArray(combatRounds.combatId, combatIds)).run()
      }

      tx.delete(sectionVisits).where(eq(sectionVisits.sessionId, sessionId)).run()
      tx.delete(combats).where(eq(combats.sessionId, sessionId)).run()
      // maps/map_nodes/map_edges are cascade-deleted via FK on session_id
      tx.delete(maps).where(eq(maps.sessionId, sessionId)).run()
      tx.delete(characters).where(eq(characters.sessionId, sessionId)).run()
      tx.delete(sessions).where(eq(sessions.id, sessionId)).run()
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
