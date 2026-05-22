import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { sessions, combats, combatRounds } from '../../../../../../lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import type { CombatOutcomeValue } from '../../../../../../lib/db/schema'

function formatTimestamp(value: Date | number | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return new Date((value as number) * 1000).toISOString()
}

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
    startedAt: formatTimestamp(combat.startedAt)!,
    endedAt: formatTimestamp(combat.endedAt),
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      detail: r.detail,
      damageDealt: r.damageDealt,
      damageTaken: r.damageTaken,
      createdAt: formatTimestamp(r.createdAt)!,
    })),
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; combatId: string }> },
): Promise<NextResponse> {
  try {
    const { id, combatId } = await params
    const sessionId = parseInt(id, 10)
    const combatIdInt = parseInt(combatId, 10)
    if (isNaN(sessionId) || isNaN(combatIdInt)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const combat = db
      .select()
      .from(combats)
      .where(and(eq(combats.id, combatIdInt), eq(combats.sessionId, sessionId)))
      .get()
    if (!combat) return NextResponse.json({ error: 'Combat not found' }, { status: 404 })

    const rounds = db
      .select()
      .from(combatRounds)
      .where(eq(combatRounds.combatId, combatIdInt))
      .orderBy(asc(combatRounds.roundNumber))
      .all()

    return NextResponse.json(formatCombat(combat, rounds))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; combatId: string }> },
): Promise<NextResponse> {
  try {
    const { id, combatId } = await params
    const sessionId = parseInt(id, 10)
    const combatIdInt = parseInt(combatId, 10)
    if (isNaN(sessionId) || isNaN(combatIdInt)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const combat = db
      .select()
      .from(combats)
      .where(and(eq(combats.id, combatIdInt), eq(combats.sessionId, sessionId)))
      .get()
    if (!combat) return NextResponse.json({ error: 'Combat not found' }, { status: 404 })

    const body = (await request.json()) as { outcome?: unknown; endedAt?: unknown }

    const validOutcomes: CombatOutcomeValue[] = ['player_fled', 'player_won', 'player_lost']
    if (!body.outcome || !validOutcomes.includes(body.outcome as CombatOutcomeValue)) {
      return NextResponse.json(
        { error: 'outcome must be one of: player_fled, player_won, player_lost' },
        { status: 400 },
      )
    }

    const endedAt =
      typeof body.endedAt === 'string' ? new Date(body.endedAt) : new Date()

    db.update(combats)
      .set({ outcome: body.outcome as CombatOutcomeValue, endedAt })
      .where(eq(combats.id, combatIdInt))
      .run()

    const updated = db.select().from(combats).where(eq(combats.id, combatIdInt)).get()!
    const rounds = db
      .select()
      .from(combatRounds)
      .where(eq(combatRounds.combatId, combatIdInt))
      .orderBy(asc(combatRounds.roundNumber))
      .all()

    return NextResponse.json(formatCombat(updated, rounds))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
