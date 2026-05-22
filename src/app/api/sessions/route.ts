import { NextRequest, NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters, maps } from '../../../lib/db/schema'

function rollDice(count: number, sides: number, modifier: number, multiplier = 1): number {
  let total = 0
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1
  }
  return total * multiplier + modifier
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
    for (const stat of gameSystem.stats) {
      if (stat.initialDice) {
        const rolled = rollDice(stat.initialDice.count, stat.initialDice.sides, stat.initialDice.modifier, stat.initialDice.multiplier)
        const max = stat.max ?? Infinity
        initialStats[stat.key] = Math.max(stat.min, Math.min(max, rolled))
      } else {
        initialStats[stat.key] = stat.min
      }
    }

    const sessionId = db.transaction((tx) => {
      const result = tx.insert(sessions).values({ gameSystemId, bookTitle }).returning({ id: sessions.id }).all()
      const session = result[0]
      tx.insert(characters).values({ sessionId: session.id, stats: initialStats, initialStats }).run()
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
