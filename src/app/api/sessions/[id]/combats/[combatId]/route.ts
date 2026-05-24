import { NextRequest, NextResponse } from 'next/server'
import '../../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../../lib/game-systems/registry'
import { db } from '../../../../../../lib/db'
import { sessions, characters, combats, combatRounds } from '../../../../../../lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import type { CombatOutcomeValue } from '../../../../../../lib/db/schema'
import { formatCombat } from '../../../../../../lib/combat-utils'
import logger from '../../../../../../lib/logger'

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

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
    const characterStats = character ? (character.stats as Record<string, unknown>) : undefined

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

    return NextResponse.json(formatCombat(combat, rounds, gameSystem, characterStats))
  } catch (err) {
    logger.error({ err }, '[GET /api/sessions/[id]/combats/[combatId]] error')
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

    // Combat outcome is server-authoritative: player_won and player_lost must only be
    // set by the round-resolution path (POST .../rounds).
    //
    // player_fled is the one exception — it is a deliberate player choice that does not
    // arise from round resolution, so the client may request it here via PATCH.
    const serverOnlyOutcomes: CombatOutcomeValue[] = ['player_won', 'player_lost']
    if (
      body.outcome !== undefined &&
      serverOnlyOutcomes.includes(body.outcome as CombatOutcomeValue)
    ) {
      return NextResponse.json(
        {
          error:
            'Combat outcome cannot be set directly. Use the round resolution path.',
        },
        { status: 400 },
      )
    }

    if (body.outcome !== 'player_fled') {
      return NextResponse.json(
        { error: 'outcome must be player_fled' },
        { status: 400 },
      )
    }

    const endedAt =
      typeof body.endedAt === 'string' ? new Date(body.endedAt) : new Date()

    db.update(combats)
      .set({ outcome: 'player_fled' as CombatOutcomeValue, endedAt })
      .where(eq(combats.id, combatIdInt))
      .run()

    const updated = db.select().from(combats).where(eq(combats.id, combatIdInt)).get()!
    const rounds = db
      .select()
      .from(combatRounds)
      .where(eq(combatRounds.combatId, combatIdInt))
      .orderBy(asc(combatRounds.roundNumber))
      .all()

    logger.info({ sessionId, combatId: combatIdInt, outcome: 'player_fled' }, 'combat resolved')
    return NextResponse.json(formatCombat(updated, rounds))
  } catch (err) {
    logger.error({ err }, '[PATCH /api/sessions/[id]/combats/[combatId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
