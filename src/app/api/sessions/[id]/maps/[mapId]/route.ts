import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { sessions, maps } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import logger from '../../../../../../lib/logger'

const PatchMapSchema = z.object({
  name: z.string().min(1),
})

function formatMap(map: typeof maps.$inferSelect) {
  return {
    id: map.id,
    sessionId: map.sessionId,
    name: map.name,
    createdAt:
      map.createdAt instanceof Date
        ? map.createdAt.toISOString()
        : new Date((map.createdAt as number) * 1000).toISOString(),
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mapId: string }> },
): Promise<NextResponse> {
  try {
    const { id, mapId } = await params
    const sessionId = parseInt(id, 10)
    const mapIdNum = parseInt(mapId, 10)

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }
    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const map = db
      .select()
      .from(maps)
      .where(and(eq(maps.id, mapIdNum), eq(maps.sessionId, sessionId)))
      .get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    const parseResult = PatchMapSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { name } = parseResult.data

    db.update(maps)
      .set({ name: name.trim() })
      .where(and(eq(maps.id, mapIdNum), eq(maps.sessionId, sessionId)))
      .run()

    const updated = db
      .select()
      .from(maps)
      .where(and(eq(maps.id, mapIdNum), eq(maps.sessionId, sessionId)))
      .get()!

    return NextResponse.json(formatMap(updated))
  } catch (err) {
    logger.error({ err }, '[PATCH /api/sessions/[id]/maps/[mapId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; mapId: string }> },
): Promise<NextResponse> {
  try {
    const { id, mapId } = await params
    const sessionId = parseInt(id, 10)
    const mapIdNum = parseInt(mapId, 10)

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }
    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const map = db
      .select()
      .from(maps)
      .where(and(eq(maps.id, mapIdNum), eq(maps.sessionId, sessionId)))
      .get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    // FK cascade on map_nodes and map_edges handles associated data
    db.delete(maps)
      .where(and(eq(maps.id, mapIdNum), eq(maps.sessionId, sessionId)))
      .run()

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error({ err }, '[DELETE /api/sessions/[id]/maps/[mapId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
