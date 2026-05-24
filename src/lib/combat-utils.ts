import { combats, combatRounds } from './db/schema'
import type { GameSystem } from './game-systems/types'

function formatTimestamp(value: Date | number | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return new Date((value as number) * 1000).toISOString()
}

export function formatCombat(
  combat: typeof combats.$inferSelect,
  rounds: (typeof combatRounds.$inferSelect)[],
  gameSystem?: GameSystem,
  characterStats?: Record<string, unknown>,
) {
  const availableRoundOptions =
    combat.outcome === 'in_progress' && gameSystem?.combat && characterStats
      ? gameSystem.combat.roundOptions({
          enemyStats: combat.enemyStats,
          enemyState: combat.enemyState,
          metadata: combat.metadata,
          characterStats,
        })
      : undefined

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
    ...(availableRoundOptions !== undefined ? { availableRoundOptions } : {}),
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
