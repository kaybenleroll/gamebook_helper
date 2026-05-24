import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../../lib/db'
import { characters, combats, combatRounds } from '../../../../../../../lib/db/schema'
import { eq, count, and, desc } from 'drizzle-orm'
import type { CombatOutcomeValue } from '../../../../../../../lib/db/schema'
import { resolveSession } from '../../../../../../../lib/api/withSession'
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
    const combatIdInt = parseInt(combatId, 10)
    if (isNaN(combatIdInt)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, gameSystem } = ctx
    const sessionId = session.id

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

    const { character } = ctx

    const body = (await request.json()) as {
      chosenOptions?: Record<string, unknown>
      combatModifiers?: Record<string, unknown>
      overrides?: { damageDealt?: number; damageTaken?: number }
      luckResults?: Array<{
        type: 'attack' | 'defence'
        roll: number
        success: boolean
        delta: number
        message: string
      }>
    }

    const chosenOptions = body.chosenOptions ?? {}
    const combatModifiers = body.combatModifiers ?? {}
    const overrides = body.overrides
    const bodyLuckResults = body.luckResults

    const characterStats = character.stats as Record<string, unknown>

    const isCommitOverride =
      (overrides !== undefined &&
        (typeof overrides.damageDealt === 'number' || typeof overrides.damageTaken === 'number')) ||
      (bodyLuckResults !== undefined && bodyLuckResults.length > 0)

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
      const safeOverrides = overrides ?? {}
      const originalEnemyState = combat.enemyState as Record<string, unknown>

      // Use system-agnostic field names to locate enemy and player HP.
      // primaryEnemyHealthStat is the key used in enemyState (e.g. 'stamina' for FF,
      // 'currentLifePoints' for GQ — note GQ's enemyState uses the prefixed form).
      // We check both the direct key and a 'current'-prefixed variant to cover both
      // systems without requiring a schema change.
      const enemyHealthField = gameSystem.combat!.primaryEnemyHealthStat
      const enemyHealthFieldPrefixed =
        'current' + enemyHealthField.charAt(0).toUpperCase() + enemyHealthField.slice(1)
      const resolvedEnemyField =
        typeof originalEnemyState[enemyHealthField] === 'number'
          ? enemyHealthField
          : enemyHealthFieldPrefixed

      const originalEnemyLp =
        typeof originalEnemyState[resolvedEnemyField] === 'number'
          ? (originalEnemyState[resolvedEnemyField] as number)
          : 0

      const playerHealthField = gameSystem.primaryHealthStat

      finalDamageDealt = typeof safeOverrides.damageDealt === 'number' ? safeOverrides.damageDealt : 0
      finalDamageTaken = typeof safeOverrides.damageTaken === 'number' ? safeOverrides.damageTaken : 0

      const newEnemyLp = Math.max(0, originalEnemyLp - finalDamageDealt)
      finalEnemyState = { ...originalEnemyState, [resolvedEnemyField]: newEnemyLp }
      finalCharacterDeltas = { [playerHealthField]: -finalDamageTaken }

      // Re-derive outcome from updated HPs
      const playerCurrentLp =
        typeof characterStats[playerHealthField] === 'number'
          ? (characterStats[playerHealthField] as number)
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

      roundDetail = {
        ...(Object.keys(safeOverrides).length > 0 ? { overrides: safeOverrides } : {}),
        ...(bodyLuckResults && bodyLuckResults.length > 0 ? { luckResults: bodyLuckResults } : {}),
      }
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
      const baseDetail = result.detail as Record<string, unknown>
      roundDetail = {
        ...baseDetail,
        ...(bodyLuckResults && bodyLuckResults.length > 0 ? { luckResults: bodyLuckResults } : {}),
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

    // Handle post-combat awards (XP, stat deltas) via game-system module
    let xpPrompt = false
    if (finalOutcome === 'player_won' || finalOutcome === 'enemy_knocked_out') {
      const postCombat = gameSystem.combat?.applyPostCombat?.(combat, newStats)
      const xpKey = gameSystem.experienceStatKey
      if (postCombat) {
        const { xpGained, statDeltas } = postCombat
        if (xpKey && typeof xpGained === 'number' && xpGained > 0) {
          const currentXp =
            typeof newStats[xpKey] === 'number' ? (newStats[xpKey] as number) : 0
          newStats = { ...newStats, [xpKey]: currentXp + xpGained }
          // Apply any post-stat-change side effects (e.g. GQ LP threshold recalculation)
          const hookResult = gameSystem.onStatChanged?.(xpKey, newStats, newInitialStats)
          if (hookResult?.initialDeltas) {
            for (const [key, delta] of Object.entries(hookResult.initialDeltas)) {
              const current =
                typeof newInitialStats[key] === 'number' ? (newInitialStats[key] as number) : 0
              newInitialStats = { ...newInitialStats, [key]: current + delta }
            }
          }
        } else if (!xpGained) {
          // Module returned no XP — show prompt if this system tracks XP
          if (xpKey) xpPrompt = true
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
