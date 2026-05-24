import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { db } from '../../../../../lib/db'
import { sessions, inventoryItems } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

const PostInventorySchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
  isSpecial: z.boolean().optional(),
})

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

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      gameSystem = null
    }

    let items = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, sessionId))
      .orderBy(asc(inventoryItems.createdAt))
      .all()

    if (items.length === 0 && gameSystem?.consumables && gameSystem.consumables.length > 0) {
      for (const consumable of gameSystem.consumables) {
        for (let i = 0; i < consumable.initialCount; i++) {
          db.insert(inventoryItems)
            .values({
              sessionId,
              name: consumable.name,
              quantity: 1,
              isSpecial: false,
              itemType: consumable.itemType,
              doseCount: consumable.doseCount,
              healAmount: consumable.healAmount ?? null,
              healDice: consumable.healDice ?? null,
            })
            .run()
        }
      }
      items = db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.sessionId, sessionId))
        .orderBy(asc(inventoryItems.createdAt))
        .all()
    }

    return NextResponse.json(items.map(formatItem))
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/inventory] error')
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

    const parseResult = PostInventorySchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { name, quantity, isSpecial } = parseResult.data

    db.insert(inventoryItems)
      .values({
        sessionId,
        name: name.trim(),
        quantity: quantity ?? 1,
        isSpecial: isSpecial ?? false,
      })
      .run()

    const created = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.sessionId, sessionId))
      .orderBy(asc(inventoryItems.createdAt))
      .all()
      .at(-1)!

    logger.debug({ sessionId }, 'inventory item added')
    return NextResponse.json(formatItem(created), { status: 201 })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/inventory] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
