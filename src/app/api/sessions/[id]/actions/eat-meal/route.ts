import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { characters, inventoryItems } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveSession } from '../../../../../../lib/api/withSession'
import logger from '../../../../../../lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, character, gameSystem } = ctx
    const sessionId = session.id

    const body = (await request.json()) as { itemId?: unknown }
    const itemId = typeof body.itemId === 'number' ? body.itemId : parseInt(String(body.itemId ?? ''), 10)
    if (isNaN(itemId)) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    const item = db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.sessionId, sessionId)))
      .get()
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (!item.doseCount || item.doseCount <= 0) {
      return NextResponse.json({ error: 'No doses remaining' }, { status: 409 })
    }

    if (typeof gameSystem.applyConsumable !== 'function') {
      return NextResponse.json(
        { error: 'This game system does not support consumable items' },
        { status: 400 },
      )
    }

    const currentStats = character.stats as Record<string, unknown>
    const currentInitialStats = character.initialStats as Record<string, unknown>

    const result = gameSystem.applyConsumable(item, currentStats, currentInitialStats)

    // Apply stat deltas to character
    const newStats: Record<string, unknown> = { ...currentStats }
    for (const [key, delta] of Object.entries(result.statDeltas)) {
      const current = typeof newStats[key] === 'number' ? (newStats[key] as number) : 0
      newStats[key] = current + delta
    }

    db.update(characters)
      .set({ stats: newStats })
      .where(eq(characters.sessionId, sessionId))
      .run()

    // Decrement doseCount; delete item if it reaches 0
    const newDoseCount = item.doseCount - 1
    if (newDoseCount <= 0) {
      db.delete(inventoryItems)
        .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.sessionId, sessionId)))
        .run()
    } else {
      db.update(inventoryItems)
        .set({ doseCount: newDoseCount })
        .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.sessionId, sessionId)))
        .run()
    }

    const updatedItem =
      newDoseCount > 0
        ? db
            .select()
            .from(inventoryItems)
            .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.sessionId, sessionId)))
            .get()
        : null

    logger.debug(
      { sessionId, itemId, statDeltas: result.statDeltas, message: result.message },
      'eat-meal performed',
    )

    return NextResponse.json({
      statDeltas: result.statDeltas,
      message: result.message,
      stats: newStats,
      initialStats: currentInitialStats,
      item: updatedItem
        ? {
            id: updatedItem.id,
            sessionId: updatedItem.sessionId,
            name: updatedItem.name,
            quantity: updatedItem.quantity,
            isSpecial: updatedItem.isSpecial,
            itemType: updatedItem.itemType,
            doseCount: updatedItem.doseCount,
            healAmount: updatedItem.healAmount,
            healDice: updatedItem.healDice,
          }
        : null,
    })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/actions/eat-meal] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
