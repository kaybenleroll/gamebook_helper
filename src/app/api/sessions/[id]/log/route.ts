import { NextRequest, NextResponse } from 'next/server'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { db } from '../../../../../lib/db'
import { sessions, sectionVisits, combats, combatRounds } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

export type SectionVisitEvent = {
  type: 'section_visit'
  sectionNumber: number
  visitedAt: string
}

export type CombatEvent = {
  type: 'combat'
  enemyName: string
  outcome: string
  rounds: number
  startedAt: string
  finalEnemyLP?: number
}

export type LogEvent = SectionVisitEvent | CombatEvent

function toIso(value: Date | number): string {
  if (value instanceof Date) return value.toISOString()
  return new Date((value as number) * 1000).toISOString()
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
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    const primaryEnemyHealthStat = gameSystem.combat?.primaryEnemyHealthStat

    const visits = db
      .select()
      .from(sectionVisits)
      .where(eq(sectionVisits.sessionId, sessionId))
      .orderBy(asc(sectionVisits.visitedAt))
      .all()

    const allCombats = db
      .select()
      .from(combats)
      .where(eq(combats.sessionId, sessionId))
      .orderBy(asc(combats.startedAt))
      .all()

    const visitEvents: LogEvent[] = visits.map((v) => ({
      type: 'section_visit' as const,
      sectionNumber: v.sectionNumber,
      visitedAt: toIso(v.visitedAt),
    }))

    const combatEvents: LogEvent[] = allCombats.map((c) => {
      const rounds = db
        .select({ id: combatRounds.id })
        .from(combatRounds)
        .where(eq(combatRounds.combatId, c.id))
        .all()

      const enemyState = c.enemyState as Record<string, unknown>
      const finalEnemyLP =
        primaryEnemyHealthStat &&
        typeof enemyState[primaryEnemyHealthStat] === 'number'
          ? (enemyState[primaryEnemyHealthStat] as number)
          : undefined

      const event: CombatEvent = {
        type: 'combat' as const,
        enemyName: c.enemyName,
        outcome: c.outcome,
        rounds: rounds.length,
        startedAt: toIso(c.startedAt),
      }

      if (finalEnemyLP !== undefined) {
        event.finalEnemyLP = finalEnemyLP
      }

      return event
    })

    const allEvents = [...visitEvents, ...combatEvents].sort((a, b) => {
      const tsA = a.type === 'section_visit' ? a.visitedAt : a.startedAt
      const tsB = b.type === 'section_visit' ? b.visitedAt : b.startedAt
      return tsA.localeCompare(tsB)
    })

    return NextResponse.json(allEvents)
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/log] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
