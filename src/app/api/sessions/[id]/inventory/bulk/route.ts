import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import logger from '../../../../../../lib/logger'

const BulkItemSchema = z.object({
  itemName: z.string().min(1),
  count: z.number().int().min(1).optional(),
})

const PostBulkInventorySchema = z.array(BulkItemSchema)

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

    const parseResult = PostBulkInventorySchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const items = parseResult.data

    if (items.length === 0) {
      return NextResponse.json([], { status: 201 })
    }

    // Insert all items in a single transaction
    db.transaction(() => {
      for (const item of items) {
        db.insert(inventoryItems)
          .values({
            sessionId,
            name: item.itemName.trim(),
            quantity: typeof item.count === 'number' && item.count >= 1 ? item.count : 1,
            isSpecial: false,
          })
          .run()
      }
    })

    // Return newly created items (the last N inserted, in insertion order)
    const allItems = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, sessionId))
      .orderBy(asc(inventoryItems.createdAt))
      .all()

    const created = allItems.slice(allItems.length - items.length)

    return NextResponse.json(created.map(formatItem), { status: 201 })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/inventory/bulk] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
