import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import logger from '../../../../../../lib/logger'

const PatchInventoryItemSchema = z.object({
  name: z.string().min(1).optional(),
  quantity: z.number().int().min(1).optional(),
  isSpecial: z.boolean().optional(),
  itemType: z.string().min(1).optional(),
  doseCount: z.number().int().min(0).optional(),
}).refine(
  (data) =>
    data.name !== undefined ||
    data.quantity !== undefined ||
    data.isSpecial !== undefined ||
    data.itemType !== undefined ||
    data.doseCount !== undefined,
  { message: 'At least one field (name, quantity, isSpecial, itemType, doseCount) must be provided' },
)

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

    const parseResult = PatchInventoryItemSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { name, quantity, isSpecial, itemType, doseCount } = parseResult.data

    if (doseCount === 0) {
      db.delete(inventoryItems)
        .where(and(eq(inventoryItems.id, itemIdNum), eq(inventoryItems.sessionId, sessionId)))
        .run()
      return new NextResponse(null, { status: 204 })
    }

    const updateFields: { name?: string; quantity?: number; isSpecial?: boolean; itemType?: string; doseCount?: number } = {}
    if (name !== undefined) updateFields.name = name.trim()
    if (quantity !== undefined) updateFields.quantity = quantity
    if (isSpecial !== undefined) updateFields.isSpecial = isSpecial
    if (itemType !== undefined) updateFields.itemType = itemType.trim()
    if (doseCount !== undefined) updateFields.doseCount = doseCount

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
  } catch (err) {
    logger.error({ err }, '[PATCH /api/sessions/[id]/inventory/[itemId]] error')
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
  } catch (err) {
    logger.error({ err }, '[DELETE /api/sessions/[id]/inventory/[itemId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
