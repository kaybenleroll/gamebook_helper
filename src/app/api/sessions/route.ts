import { NextRequest, NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters, maps, inventoryItems, sessionSpells } from '../../../lib/db/schema'
import type { CreationRolls, RollAttempt, SessionMetadata } from '../../../lib/db/schema'
import logger from '../../../lib/logger'

function rollOnce(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
}

function rollDice(
  count: number,
  sides: number,
  modifier: number,
  multiplier = 1,
  bestOf?: number,
  worstOf?: number,
): { result: number; best: number; attempts: RollAttempt[] } {
  const numAttempts = bestOf ?? worstOf ?? 1
  const attempts: RollAttempt[] = Array.from({ length: numAttempts }, () => {
    const dice = rollOnce(count, sides)
    return { dice, total: dice.reduce((s, d) => s + d, 0) }
  })
  const best = worstOf != null
    ? Math.min(...attempts.map((a) => a.total))
    : Math.max(...attempts.map((a) => a.total))
  return { result: best * multiplier + modifier, best, attempts }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { gameSystemId?: unknown; bookTitle?: unknown }
    const { gameSystemId, bookTitle } = body

    if (!gameSystemId || !bookTitle || typeof gameSystemId !== 'string' || typeof bookTitle !== 'string') {
      return NextResponse.json(
        { error: 'gameSystemId and bookTitle are required' },
        { status: 400 },
      )
    }

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 400 })
    }

    const initialStats: Record<string, number> = {}
    const creationRolls: CreationRolls = {}
    for (const stat of gameSystem.stats) {
      if (stat.initialDice) {
        const { result, best, attempts } = rollDice(
          stat.initialDice.count,
          stat.initialDice.sides,
          stat.initialDice.modifier,
          stat.initialDice.multiplier,
          stat.initialDice.bestOf,
          stat.initialDice.worstOf,
        )
        const max = stat.max ?? Infinity
        const clamped = Math.max(stat.min, Math.min(max, result))
        initialStats[stat.key] = clamped
        creationRolls[stat.key] = {
          attempts,
          best,
          multiplier: stat.initialDice.multiplier ?? 1,
          result: clamped,
          statLabel: stat.label,
        }
      } else {
        initialStats[stat.key] = stat.min
      }
    }

    const initialMetadata: SessionMetadata = gameSystem.initialMetadata?.() ?? {}

    const sessionId = db.transaction((tx) => {
      const result = tx.insert(sessions).values({ gameSystemId, bookTitle, metadata: initialMetadata }).returning({ id: sessions.id }).all()
      const session = result[0]
      tx.insert(characters).values({ sessionId: session.id, stats: initialStats, initialStats, creationRolls }).run()
      tx.insert(maps).values({ sessionId: session.id, name: 'Map 1' }).run()

      // Seed default inventory items from consumable definitions
      if (gameSystem.consumables && gameSystem.consumables.length > 0) {
        for (const consumable of gameSystem.consumables) {
          for (let i = 0; i < consumable.initialCount; i++) {
            tx.insert(inventoryItems).values({
              sessionId: session.id,
              name: consumable.name,
              quantity: 1,
              isSpecial: false,
              itemType: consumable.itemType,
              doseCount: consumable.doseCount,
              healAmount: consumable.healAmount ?? null,
              healDice: consumable.healDice ?? null,
            }).run()
          }
        }
      }

      // Seed default spell state from spell definitions
      if (gameSystem.spells && gameSystem.spells.length > 0) {
        for (const spell of gameSystem.spells) {
          tx.insert(sessionSpells).values({
            sessionId: session.id,
            spellId: spell.id,
            usesRemaining: spell.maxUses,
          }).run()
        }
      }

      return session.id
    })

    logger.info({ sessionId }, 'session created')
    return NextResponse.json({ sessionId }, { status: 201 })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const allSessions = db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all()
    const result = allSessions.map((session) => {
      let gameSystemName = session.gameSystemId
      try { gameSystemName = gameSystemRegistry.get(session.gameSystemId).name } catch { /* unknown system */ }
      return {
        id: session.id,
        gameSystemName,
        bookTitle: session.bookTitle,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
