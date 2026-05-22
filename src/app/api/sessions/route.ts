import { NextRequest, NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters, maps } from '../../../lib/db/schema'
import type { CreationRolls, RollAttempt } from '../../../lib/db/schema'

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

    const sessionId = db.transaction((tx) => {
      const result = tx.insert(sessions).values({ gameSystemId, bookTitle }).returning({ id: sessions.id }).all()
      const session = result[0]
      tx.insert(characters).values({ sessionId: session.id, stats: initialStats, initialStats, creationRolls }).run()
      tx.insert(maps).values({ sessionId: session.id, width: 20, height: 20 }).run()
      return session.id
    })

    return NextResponse.json({ sessionId }, { status: 201 })
  } catch {
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
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
