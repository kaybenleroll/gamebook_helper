import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'

function formatItem(item: typeof inventoryItems.$inferSelect) {
  return {
    id: item.id,
    sessionId: item.sessionId,
    name: item.name,
    quantity: item.quantity,
    isSpecial: item.isSpecial,
    itemType: item.itemType,
    doseCount: item.doseCount,
    healAmount: item.healAmount,
    healDice: item.healDice,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : new Date((item.createdAt as number) * 1000).toISOString(),
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  try {
    const { id, itemId } = await params
    const sessionId = parseInt(id, 10)
    const itemIdNum = parseInt(itemId, 10)

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }
    if (isNaN(itemIdNum)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const item = db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
      .get()
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const body = (await request.json()) as {
      name?: unknown
      quantity?: unknown
      isSpecial?: unknown
      doseCount?: unknown
    }

    const { name, quantity, isSpecial, doseCount } = body

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return NextResponse.json(
        { error: 'name must be a non-empty string' },
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

    if (doseCount !== undefined && (typeof doseCount !== 'number' || !Number.isInteger(doseCount) || doseCount < 0)) {
      return NextResponse.json(
        { error: 'doseCount must be a non-negative integer' },
        { status: 400 },
      )
    }

    if (name === undefined && quantity === undefined && isSpecial === undefined && doseCount === undefined) {
      return NextResponse.json(
        { error: 'At least one field (name, quantity, isSpecial, doseCount) must be provided' },
        { status: 400 },
      )
    }

    if (doseCount === 0) {
      db.delete(inventoryItems)
        .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
        .run()
      return new NextResponse(null, { status: 204 })
    }

    const updateFields: { name?: string; quantity?: number; isSpecial?: boolean; doseCount?: number } = {}
    if (name !== undefined) updateFields.name = (name as string).trim()
    if (quantity !== undefined) updateFields.quantity = quantity as number
    if (isSpecial !== undefined) updateFields.isSpecial = isSpecial as boolean
    if (doseCount !== undefined) updateFields.doseCount = doseCount as number

    db.update(inventoryItems)
      .set(updateFields)
      .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
      .run()

    const updated = db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
      .get()!

    return NextResponse.json(formatItem(updated))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
): Promise<NextResponse> {
  try {
    const { id, itemId } = await params
    const sessionId = parseInt(id, 10)
    const itemIdNum = parseInt(itemId, 10)

    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }
    if (isNaN(itemIdNum)) {
      return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const item = db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
      .get()
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    db.delete(inventoryItems)
      .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
      .run()

    return new NextResponse(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
