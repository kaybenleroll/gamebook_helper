import { NextRequest, NextResponse } from 'next/server'
import '../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../lib/game-systems/registry'
import { db } from '../../../../lib/db'
import { sessions, characters, maps, mapCells, mapEdges, combats, combatRounds, sectionVisits } from '../../../../lib/db/schema'
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
      },
      gameSystem: {
        stats: gameSystem.stats.map((s) => ({ key: s.key, label: s.label })),
      },
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
      const sessionMaps = tx.select({ id: maps.id }).from(maps).where(eq(maps.sessionId, sessionId)).all()
      const sessionCombats = tx.select({ id: combats.id }).from(combats).where(eq(combats.sessionId, sessionId)).all()

      const mapIds = sessionMaps.map((m) => m.id)
      const combatIds = sessionCombats.map((c) => c.id)

      if (mapIds.length > 0) {
        tx.delete(mapCells).where(inArray(mapCells.mapId, mapIds)).run()
        tx.delete(mapEdges).where(inArray(mapEdges.mapId, mapIds)).run()
      }

      if (combatIds.length > 0) {
        tx.delete(combatRounds).where(inArray(combatRounds.combatId, combatIds)).run()
      }

      tx.delete(sectionVisits).where(eq(sectionVisits.sessionId, sessionId)).run()
      tx.delete(combats).where(eq(combats.sessionId, sessionId)).run()
      tx.delete(maps).where(eq(maps.sessionId, sessionId)).run()
      tx.delete(characters).where(eq(characters.sessionId, sessionId)).run()
      tx.delete(sessions).where(eq(sessions.id, sessionId)).run()
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
