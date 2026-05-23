import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

interface BulkItem {
  count: number
  itemName: string
}

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

    const body = (await request.json()) as unknown

    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be an array' }, { status: 400 })
    }

    const items = body as BulkItem[]

    if (items.length === 0) {
      return NextResponse.json([], { status: 201 })
    }

    // Validate all items before inserting any
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item || typeof item !== 'object') {
        return NextResponse.json({ error: `Item at index ${i} is not an object` }, { status: 400 })
      }
      if (!item.itemName || typeof item.itemName !== 'string' || item.itemName.trim() === '') {
        return NextResponse.json(
          { error: `Item at index ${i}: itemName is required and must be a non-empty string` },
          { status: 400 },
        )
      }
      if (
        item.count !== undefined &&
        (typeof item.count !== 'number' || !Number.isInteger(item.count) || item.count < 1)
      ) {
        return NextResponse.json(
          { error: `Item at index ${i}: count must be a positive integer` },
          { status: 400 },
        )
      }
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
    console.error('[POST /api/sessions/[id]/inventory/bulk]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
