import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../lib/db'
import { sessions, maps } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

const PostMapSchema = z.object({
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

    const allMaps = db
      .select()
      .from(maps)
      .where(eq(maps.sessionId, sessionId))
      .orderBy(asc(maps.createdAt))
      .all()

    return NextResponse.json(allMaps.map(formatMap))
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/maps] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
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

    const parseResult = PostMapSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { name } = parseResult.data

    db.insert(maps)
      .values({ sessionId, name: name.trim() })
      .run()

    const created = db
      .select()
      .from(maps)
      .where(eq(maps.sessionId, sessionId))
      .orderBy(asc(maps.createdAt))
      .all()
      .at(-1)!

    return NextResponse.json(formatMap(created), { status: 201 })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/maps] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
