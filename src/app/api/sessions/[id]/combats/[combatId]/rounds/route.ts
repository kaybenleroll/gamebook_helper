import { NextRequest, NextResponse } from 'next/server'
import '../../../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../../../lib/game-systems/registry'
import { applyXpThreshold } from '../../../../../../../lib/game-systems/grail-quest'
import { db } from '../../../../../../../lib/db'
import { sessions, characters, combats, combatRounds } from '../../../../../../../lib/db/schema'
import { eq, count, and } from 'drizzle-orm'
import type { CombatOutcomeValue } from '../../../../../../../lib/db/schema'
import logger from '../../../../../../../lib/logger'

function formatTs(v: Date | number | null): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return new Date((v as number) * 1000).toISOString()
}

export async function POST(
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

    const combat = db
      .select()
      .from(combats)
      .where(and(eq(combats.id, combatIdInt), eq(combats.sessionId, sessionId)))
      .get()
    if (!combat) return NextResponse.json({ error: 'Combat not found' }, { status: 404 })

    if (combat.outcome !== 'in_progress') {
      return NextResponse.json({ error: 'Combat is no longer in progress' }, { status: 409 })
    }

    const character = db
      .select()
      .from(characters)
      .where(eq(characters.sessionId, sessionId))
      .get()
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    const body = (await request.json()) as {
      chosenOptions?: Record<string, unknown>
      combatModifiers?: Record<string, unknown>
      overrides?: { damageDealt?: number; damageTaken?: number }
    }

    const chosenOptions = body.chosenOptions ?? {}
    const combatModifiers = body.combatModifiers ?? {}
    const overrides = body.overrides ?? {}

    const characterStats = character.stats as Record<string, unknown>

    // Resolve round via game system — all combat maths live in the game-system module
    const result = gameSystem.combat.resolveRound({
      enemyStats: combat.enemyStats,
      enemyState: combat.enemyState,
      metadata: combat.metadata,
      characterStats,
      chosenOptions,
      combatModifiers,
    })

    // Apply overrides if present
    const finalDamageDealt =
      typeof overrides.damageDealt === 'number' ? overrides.damageDealt : result.damageDealt
    const finalDamageTaken =
      typeof overrides.damageTaken === 'number' ? overrides.damageTaken : result.damageTaken

    // Recalculate enemy state if damage dealt was overridden
    let finalEnemyState = result.enemyState as Record<string, unknown>
    if (typeof overrides.damageDealt === 'number') {
      const originalEnemyState = combat.enemyState as Record<string, unknown>
      const currentLifePoints =
        typeof originalEnemyState['currentLifePoints'] === 'number'
          ? (originalEnemyState['currentLifePoints'] as number)
          : 0
      finalEnemyState = {
        ...finalEnemyState,
        currentLifePoints: Math.max(0, currentLifePoints - finalDamageDealt),
      }
    }

    // Recalculate character deltas if damage taken was overridden
    const finalCharacterDeltas: Record<string, number> = { ...result.characterDeltas }
    if (typeof overrides.damageTaken === 'number') {
      finalCharacterDeltas['lifePoints'] = -overrides.damageTaken
    }

    // Recalculate outcome with final values
    const enemyCurrentStamina =
      typeof finalEnemyState['currentLifePoints'] === 'number'
        ? (finalEnemyState['currentLifePoints'] as number)
        : 0
    const playerCurrentLp =
      typeof characterStats['lifePoints'] === 'number'
        ? (characterStats['lifePoints'] as number)
        : 0
    const playerNewLp = playerCurrentLp + (finalCharacterDeltas['lifePoints'] ?? 0)

    let finalOutcome: CombatOutcomeValue | null = result.outcome as CombatOutcomeValue | null
    if (typeof overrides.damageDealt === 'number' || typeof overrides.damageTaken === 'number') {
      // Re-derive outcome when overrides change the damage figures
      if (enemyCurrentStamina <= 0) {
        finalOutcome = 'player_won'
      } else if (playerNewLp <= 0) {
        finalOutcome = 'player_lost'
      } else {
        finalOutcome = null
      }
    }

    // Pre-compute updated character stats (needed inside transaction and for response)
    let newStats = { ...characterStats }
    const currentInitialStats = character.initialStats as Record<string, unknown>
    let newInitialStats = { ...currentInitialStats }

    for (const [stat, delta] of Object.entries(finalCharacterDeltas)) {
      const statDef = gameSystem.stats.find((s) => s.key === stat)
      if (!statDef) continue
      const current =
        typeof newStats[stat] === 'number' ? (newStats[stat] as number) : statDef.min
      const updated = Math.max(statDef.min, Math.min(statDef.max ?? Infinity, current + delta))
      newStats = { ...newStats, [stat]: updated }
    }

    // Handle XP award for GQ win
    let xpPrompt = false
    if (finalOutcome === 'player_won' && session.gameSystemId === 'grail-quest') {
      const metadata = combat.metadata as Record<string, unknown>
      const enemyXp =
        typeof metadata['enemyXp'] === 'number' ? (metadata['enemyXp'] as number) : 0
      if (enemyXp > 0) {
        const currentXp =
          typeof newStats['experiencePoints'] === 'number'
            ? (newStats['experiencePoints'] as number)
            : 0
        newStats = { ...newStats, experiencePoints: currentXp + enemyXp }
        const xpResult = applyXpThreshold(newStats, newInitialStats)
        newStats = xpResult.stats
        newInitialStats = xpResult.initialStats
      } else {
        xpPrompt = true
      }
    }

    // Get next round number
    const roundCountResult = db
      .select({ count: count() })
      .from(combatRounds)
      .where(eq(combatRounds.combatId, combatIdInt))
      .get()
    const nextRoundNumber = (roundCountResult?.count ?? 0) + 1

    const detail = result.detail as Record<string, unknown>

    // Write everything in a transaction
    db.transaction(() => {
      db.insert(combatRounds)
        .values({
          combatId: combatIdInt,
          roundNumber: nextRoundNumber,
          detail: { ...detail, overrides },
          damageDealt: finalDamageDealt,
          damageTaken: finalDamageTaken,
        })
        .run()

      db.update(combats)
        .set({ enemyState: finalEnemyState })
        .where(eq(combats.id, combatIdInt))
        .run()

      db.update(characters)
        .set({ stats: newStats, initialStats: newInitialStats })
        .where(eq(characters.sessionId, sessionId))
        .run()

      if (finalOutcome) {
        db.update(combats)
          .set({ outcome: finalOutcome, endedAt: new Date() })
          .where(eq(combats.id, combatIdInt))
          .run()
      }
    })

    // Re-fetch updated state
    const updatedCombat = db.select().from(combats).where(eq(combats.id, combatIdInt)).get()!
    const insertedRound = db
      .select()
      .from(combatRounds)
      .where(
        and(
          eq(combatRounds.combatId, combatIdInt),
          eq(combatRounds.roundNumber, nextRoundNumber),
        ),
      )
      .get()!

    const availableRoundOptions =
      updatedCombat.outcome === 'in_progress' && gameSystem.combat
        ? gameSystem.combat.roundOptions({
            enemyStats: updatedCombat.enemyStats,
            enemyState: finalEnemyState,
            metadata: updatedCombat.metadata,
            characterStats: newStats,
          })
        : undefined

    return NextResponse.json(
      {
        round: {
          id: insertedRound.id,
          roundNumber: insertedRound.roundNumber,
          detail: insertedRound.detail,
          damageDealt: insertedRound.damageDealt,
          damageTaken: insertedRound.damageTaken,
          createdAt: formatTs(insertedRound.createdAt)!,
        },
        combat: {
          id: updatedCombat.id,
          outcome: updatedCombat.outcome,
          enemyState: updatedCombat.enemyState,
          endedAt: formatTs(updatedCombat.endedAt),
          ...(availableRoundOptions !== undefined ? { availableRoundOptions } : {}),
        },
        characterStats: newStats,
        characterInitialStats: newInitialStats,
        ...(xpPrompt ? { xpPrompt: true } : {}),
      },
      { status: 201 },
    )
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/combats/[combatId]/rounds] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
