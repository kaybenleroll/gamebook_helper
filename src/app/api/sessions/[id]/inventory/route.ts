import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

function formatItem(item: typeof inventoryItems.$inferSelect) {
  return {
    id: item.id,
    sessionId: item.sessionId,
    name: item.name,
    quantity: item.quantity,
    isSpecial: item.isSpecial,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : new Date((item.createdAt as number) * 1000).toISOString(),
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

    const items = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, sessionId))
      .orderBy(asc(inventoryItems.createdAt))
      .all()

    return NextResponse.json(items.map(formatItem))
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
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const body = (await request.json()) as {
      name?: unknown
      quantity?: unknown
      isSpecial?: unknown
    }

    const { name, quantity, isSpecial } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'name is required and must be a non-empty string' },
        { status: 400 },
      )
    }

    if (quantity !== undefined && (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1)) {
      return NextResponse.json(
        { error: 'quantity must be a positive integer' },
        { status: 400 },
      )
    }

    if (isSpecial !== undefined && typeof isSpecial !== 'boolean') {
      return NextResponse.json(
        { error: 'isSpecial must be a boolean' },
        { status: 400 },
      )
    }

    db.insert(inventoryItems)
      .values({
        sessionId,
        name: name.trim(),
        quantity: typeof quantity === 'number' ? quantity : 1,
        isSpecial: typeof isSpecial === 'boolean' ? isSpecial : false,
      })
      .run()

    const created = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, sessionId))
      .orderBy(asc(inventoryItems.createdAt))
      .all()
      .at(-1)!

    return NextResponse.json(formatItem(created), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
