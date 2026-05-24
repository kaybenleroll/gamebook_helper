import { NextRequest, NextResponse } from 'next/server'
import '../../../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../../../lib/game-systems/registry'
import { applyXpThreshold } from '../../../../../../../lib/game-systems/grail-quest'
import { db } from '../../../../../../../lib/db'
// NOTE: applyXpThreshold is still imported here because the post-combat XP flow
// requires LP-threshold recalculation which is Grail Quest-specific bookkeeping
// tracked in initialStats; this will be addressed in a follow-up slice.
import { sessions, characters, combats, combatRounds } from '../../../../../../../lib/db/schema'
import { eq, count, and, desc } from 'drizzle-orm'
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
    const overrides = body.overrides

    const characterStats = character.stats as Record<string, unknown>

    const isCommitOverride =
      overrides !== undefined &&
      (typeof overrides.damageDealt === 'number' || typeof overrides.damageTaken === 'number')

    // 422 guard: damageTaken override is invalid on a phaseTwoSkipped round
    if (isCommitOverride && typeof overrides!.damageTaken === 'number') {
      const lastRound = db
        .select()
        .from(combatRounds)
        .where(eq(combatRounds.combatId, combatIdInt))
        .orderBy(desc(combatRounds.roundNumber))
        .limit(1)
        .get()
      if (lastRound) {
        const lastDetail = lastRound.detail as Record<string, unknown>
        if (lastDetail['phaseTwoSkipped'] === true) {
          return NextResponse.json(
            { error: 'damageTaken override is not valid on a round where Phase 2 was skipped' },
            { status: 422 },
          )
        }
      }
    }

    let finalDamageDealt: number
    let finalDamageTaken: number
    let finalEnemyState: Record<string, unknown>
    let finalCharacterDeltas: Record<string, number>
    let finalOutcome: CombatOutcomeValue | null
    let roundDetail: Record<string, unknown>

    if (isCommitOverride) {
      // Commit path: apply override damage values directly to existing combat state.
      // Do NOT re-call resolveRound — this avoids re-rolling dice.
      const safeOverrides = overrides!
      const originalEnemyState = combat.enemyState as Record<string, unknown>
      const originalEnemyLp =
        typeof originalEnemyState['currentLifePoints'] === 'number'
          ? (originalEnemyState['currentLifePoints'] as number)
          : 0

      finalDamageDealt = typeof safeOverrides.damageDealt === 'number' ? safeOverrides.damageDealt : 0
      finalDamageTaken = typeof safeOverrides.damageTaken === 'number' ? safeOverrides.damageTaken : 0

      const newEnemyLp = Math.max(0, originalEnemyLp - finalDamageDealt)
      finalEnemyState = { ...originalEnemyState, currentLifePoints: newEnemyLp }
      finalCharacterDeltas = { lifePoints: -finalDamageTaken }

      // Re-derive outcome from updated HPs
      const playerCurrentLp =
        typeof characterStats['lifePoints'] === 'number'
          ? (characterStats['lifePoints'] as number)
          : 0
      const playerNewLp = playerCurrentLp - finalDamageTaken
      const knockoutThreshold = gameSystem.combat?.knockoutThreshold ?? null
      if (knockoutThreshold !== null && newEnemyLp <= knockoutThreshold) {
        finalOutcome = newEnemyLp <= 0 ? 'player_won' : 'enemy_knocked_out'
      } else if (newEnemyLp <= 0) {
        finalOutcome = 'player_won'
      } else if (playerNewLp <= 0) {
        finalOutcome = 'player_lost'
      } else {
        finalOutcome = null
      }

      roundDetail = { overrides: safeOverrides }
    } else {
      // Normal path: resolve round via game system — all combat maths live in the game-system module
      const result = gameSystem.combat.resolveRound({
        enemyStats: combat.enemyStats,
        enemyState: combat.enemyState,
        metadata: combat.metadata,
        characterStats,
        chosenOptions,
        combatModifiers: combatModifiers ?? {},
      })

      finalDamageDealt = result.damageDealt
      finalDamageTaken = result.damageTaken
      finalEnemyState = result.enemyState as Record<string, unknown>
      finalCharacterDeltas = { ...result.characterDeltas }
      finalOutcome = result.outcome as CombatOutcomeValue | null
      roundDetail = result.detail as Record<string, unknown>
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

    // Handle post-combat awards (XP, stat deltas) via game-system module
    let xpPrompt = false
    if (finalOutcome === 'player_won' || finalOutcome === 'enemy_knocked_out') {
      const postCombat = gameSystem.combat?.applyPostCombat?.(combat, newStats)
      if (postCombat) {
        const { xpGained, statDeltas } = postCombat
        if (typeof xpGained === 'number' && xpGained > 0) {
          const currentXp =
            typeof newStats['experiencePoints'] === 'number'
              ? (newStats['experiencePoints'] as number)
              : 0
          newStats = { ...newStats, experiencePoints: currentXp + xpGained }
          const xpResult = applyXpThreshold(newStats, newInitialStats)
          newStats = xpResult.stats
          newInitialStats = xpResult.initialStats
        } else if (!xpGained) {
          // Module returned no XP — check if this system tracks XP at all
          const hasXpStat = gameSystem.stats.some((s) => s.key === 'experiencePoints')
          if (hasXpStat) xpPrompt = true
        }
        if (statDeltas) {
          for (const [stat, delta] of Object.entries(statDeltas)) {
            const statDef = gameSystem.stats.find((s) => s.key === stat)
            if (!statDef) continue
            const current =
              typeof newStats[stat] === 'number' ? (newStats[stat] as number) : statDef.min
            newStats = {
              ...newStats,
              [stat]: Math.max(statDef.min, Math.min(statDef.max ?? Infinity, current + delta)),
            }
          }
        }
      }
    }

    // Get next round number
    const roundCountResult = db
      .select({ count: count() })
      .from(combatRounds)
      .where(eq(combatRounds.combatId, combatIdInt))
      .get()
    const nextRoundNumber = (roundCountResult?.count ?? 0) + 1

    // Write everything in a transaction
    db.transaction(() => {
      db.insert(combatRounds)
        .values({
          combatId: combatIdInt,
          roundNumber: nextRoundNumber,
          detail: roundDetail,
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
