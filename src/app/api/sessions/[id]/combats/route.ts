import { NextRequest, NextResponse } from 'next/server'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { db } from '../../../../../lib/db'
import { sessions, characters, combats, combatRounds } from '../../../../../lib/db/schema'
import { eq, desc, asc } from 'drizzle-orm'

function formatCombat(
  combat: typeof combats.$inferSelect,
  rounds: (typeof combatRounds.$inferSelect)[],
) {
  return {
    id: combat.id,
    sessionId: combat.sessionId,
    enemyName: combat.enemyName,
    enemyStats: combat.enemyStats,
    enemyState: combat.enemyState,
    metadata: combat.metadata,
    outcome: combat.outcome,
    startedAt:
      combat.startedAt instanceof Date
        ? combat.startedAt.toISOString()
        : new Date((combat.startedAt as number) * 1000).toISOString(),
    endedAt: combat.endedAt
      ? combat.endedAt instanceof Date
        ? combat.endedAt.toISOString()
        : new Date((combat.endedAt as number) * 1000).toISOString()
      : null,
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      detail: r.detail,
      damageDealt: r.damageDealt,
      damageTaken: r.damageTaken,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date((r.createdAt as number) * 1000).toISOString(),
    })),
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const allCombats = db
      .select()
      .from(combats)
      .where(eq(combats.sessionId, sessionId))
      .orderBy(desc(combats.startedAt))
      .all()

    const activeCombat = allCombats.find((c) => c.outcome === 'in_progress') ?? null
    const historyCombats = allCombats.filter((c) => c.outcome !== 'in_progress')

    let activeWithRounds = null
    if (activeCombat) {
      const rounds = db
        .select()
        .from(combatRounds)
        .where(eq(combatRounds.combatId, activeCombat.id))
        .orderBy(asc(combatRounds.roundNumber))
        .all()
      activeWithRounds = formatCombat(activeCombat, rounds)
    }

    const history = historyCombats.map((c) => formatCombat(c, []))

    return NextResponse.json({ active: activeWithRounds, history })
  } catch {
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
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    if (!gameSystem.combat) {
      return NextResponse.json(
        { error: 'Combat is not supported for this game system' },
        { status: 422 },
      )
    }

    const body = (await request.json()) as unknown

    // Validate enemy stats
    const validationErrors = gameSystem.combat.validateEnemyStats(body)
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'Invalid enemy stats', details: validationErrors }, { status: 400 })
    }

    const { enemyState, metadata } = gameSystem.combat.start(body)

    const bodyRecord = body as Record<string, unknown>
    const enemyName =
      typeof bodyRecord['name'] === 'string' ? bodyRecord['name'] : 'Unknown enemy'

    let combat
    try {
      db.insert(combats)
        .values({
          sessionId,
          enemyName,
          enemyStats: bodyRecord,
          enemyState: enemyState as Record<string, unknown>,
          metadata: metadata as Record<string, unknown>,
          outcome: 'in_progress',
        })
        .run()

      combat = db
        .select()
        .from(combats)
        .where(eq(combats.sessionId, sessionId))
        .orderBy(desc(combats.startedAt))
        .get()
    } catch (err) {
      // Partial unique index violation — already an active combat
      if (
        err instanceof Error &&
        err.message.includes('UNIQUE constraint failed')
      ) {
        return NextResponse.json({ error: 'A combat is already in progress for this session' }, { status: 409 })
      }
      throw err
    }

    return NextResponse.json(formatCombat(combat!, []), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
