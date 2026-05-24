import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { characters, combats, combatRounds } from '../../../../../../lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import type { CombatOutcomeValue } from '../../../../../../lib/db/schema'
import { resolveSession } from '../../../../../../lib/api/withSession'
import { formatCombat } from '../../../../../../lib/combat-utils'
import logger from '../../../../../../lib/logger'

const PatchCombatSchema = z.object({
  outcome: z.string().optional(),
  endedAt: z.string().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; combatId: string }> },
): Promise<NextResponse> {
  try {
    const { id, combatId } = await params
    const combatIdInt = parseInt(combatId, 10)
    if (isNaN(combatIdInt)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, gameSystem } = ctx
    const sessionId = session.id

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
    const combatIdInt = parseInt(combatId, 10)
    if (isNaN(combatIdInt)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session } = ctx
    const sessionId = session.id

    const combat = db
      .select()
      .from(combats)
      .where(and(eq(combats.id, combatIdInt), eq(combats.sessionId, sessionId)))
      .get()
    if (!combat) return NextResponse.json({ error: 'Combat not found' }, { status: 404 })

    const parseResult = PatchCombatSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const body = parseResult.data

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
