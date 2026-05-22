import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../lib/db'
import { sessions, sectionVisits } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

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
  } catch {
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

    const body = await request.json() as { sectionNumber?: unknown }
    const { sectionNumber } = body
    if (typeof sectionNumber !== 'number' || !Number.isInteger(sectionNumber) || sectionNumber < 1) {
      return NextResponse.json({ error: 'sectionNumber must be a positive integer' }, { status: 400 })
    }

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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
