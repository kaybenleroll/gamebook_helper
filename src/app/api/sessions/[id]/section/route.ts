import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../lib/db'
import { sessions, sectionVisits } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

const PostSectionSchema = z.object({
  sectionNumber: z.number().int().min(1),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const history = db
      .select()
      .from(sectionVisits)
      .where(eq(sectionVisits.sessionId, sessionId))
      .orderBy(asc(sectionVisits.visitedAt))
      .all()

    const currentSection = history.length > 0
      ? history[history.length - 1].sectionNumber
      : null

    return NextResponse.json({
      currentSection,
      history: history.map((v) => ({
        sectionNumber: v.sectionNumber,
        visitedAt: v.visitedAt instanceof Date
          ? v.visitedAt.toISOString()
          : new Date((v.visitedAt as number) * 1000).toISOString(),
      })),
    })
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/section] error')
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
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const parseResult = PostSectionSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { sectionNumber } = parseResult.data

    db.insert(sectionVisits).values({ sessionId, sectionNumber }).run()

    const inserted = db
      .select()
      .from(sectionVisits)
      .where(eq(sectionVisits.sessionId, sessionId))
      .orderBy(asc(sectionVisits.visitedAt))
      .all()

    const entry = inserted[inserted.length - 1]

    return NextResponse.json(
      {
        sectionNumber: entry.sectionNumber,
        visitedAt: entry.visitedAt instanceof Date
          ? entry.visitedAt.toISOString()
          : new Date((entry.visitedAt as number) * 1000).toISOString(),
      },
      { status: 201 },
    )
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/section] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
