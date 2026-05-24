import { NextRequest, NextResponse } from 'next/server'
import '../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../lib/game-systems/registry'
import { db } from '../../../../lib/db'
import { sessions, characters } from '../../../../lib/db/schema'
import type { SessionMetadata } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import logger from '../../../../lib/logger'

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
        metadata: (session.metadata ?? {}) as SessionMetadata,
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
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]] error')
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

    const body = await request.json() as { bookTitle?: unknown; notes?: unknown; panelOrder?: unknown; metadata?: unknown }
    const { bookTitle, notes, panelOrder, metadata } = body

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

    if (metadata !== undefined && (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))) {
      return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 })
    }

    if (bookTitle === undefined && notes === undefined && panelOrder === undefined && metadata === undefined) {
      return NextResponse.json({ error: 'At least one field (bookTitle, notes, panelOrder, or metadata) must be provided' }, { status: 400 })
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
      metadata?: SessionMetadata
    } = { updatedAt: new Date() }
    if (bookTitle !== undefined) updateFields.bookTitle = (bookTitle as string).trim()
    if (notes !== undefined) updateFields.notes = notes === '' ? null : (notes as string)
    if (panelOrder !== undefined) updateFields.panelOrder = JSON.stringify(panelOrder)
    if (metadata !== undefined) {
      const existing = (session.metadata ?? {}) as SessionMetadata
      updateFields.metadata = { ...existing, ...(metadata as SessionMetadata) }
    }

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
      metadata: (updatedSession.metadata ?? {}) as SessionMetadata,
    })
  } catch (err) {
    logger.error({ err }, '[PATCH /api/sessions/[id]] error')
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

    // All child tables (characters, maps, combats, combat_rounds, section_visits,
    // inventory_items, session_spells) carry ON DELETE CASCADE FKs — a single
    // delete on the parent cascades to all of them automatically.
    db.delete(sessions).where(eq(sessions.id, sessionId)).run()

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error({ err }, '[DELETE /api/sessions/[id]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
