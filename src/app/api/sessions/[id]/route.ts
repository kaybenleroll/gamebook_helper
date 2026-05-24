import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../lib/db'
import { sessions } from '../../../../lib/db/schema'
import type { SessionMetadata } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveSession } from '../../../../lib/api/withSession'
import logger from '../../../../lib/logger'

const PatchSessionSchema = z.object({
  bookTitle: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  panelOrder: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) =>
    data.bookTitle !== undefined ||
    data.notes !== undefined ||
    data.panelOrder !== undefined ||
    data.metadata !== undefined,
  { message: 'At least one field (bookTitle, notes, panelOrder, or metadata) must be provided' },
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, character, gameSystem } = ctx

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

    const parseResult = PatchSessionSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { bookTitle, notes, panelOrder, metadata } = parseResult.data

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
