import type { GameSystem } from './types'
import { gameSystemRegistry } from './registry'

export const XP_PER_LP = 20

/**
 * Returns the number of LP max bonuses earned for a given XP total.
 * Every 20 XP earns +1 permanent Life Points maximum.
 */
export function xpToLpBonuses(xp: number): number {
  return Math.floor(xp / XP_PER_LP)
}

/**
 * Returns XP progress toward the next LP threshold.
 * e.g. xp=8  → { progress: 8, threshold: 20 }
 * e.g. xp=25 → { progress: 5, threshold: 20 }
 */
export function xpThresholdProgress(xp: number): { progress: number; threshold: number } {
  return { progress: xp % XP_PER_LP, threshold: XP_PER_LP }
}

/**
 * After an XP change, check whether the character has crossed a new LP threshold
 * and, if so, permanently increase the LP maximum (initialStats lifePoints).
 *
 * Returns updated copies of both stats and initialStats. If no threshold was
 * crossed the returned objects are new references with the same values.
 */
export function applyXpThreshold(
  stats: Record<string, unknown>,
  initialStats: Record<string, unknown>,
): { stats: Record<string, unknown>; initialStats: Record<string, unknown> } {
  const xp = typeof stats['experiencePoints'] === 'number' ? stats['experiencePoints'] : 0
  const bonuses = xpToLpBonuses(xp)

  // The baseline LP max is stored in initialStats.  We track how many bonus
  // points have already been awarded via initialStats.lifePointsXpBonuses so
  // that we can detect new thresholds without caring about the starting value.
  const alreadyAwarded =
    typeof initialStats['lifePointsXpBonuses'] === 'number'
      ? initialStats['lifePointsXpBonuses']
      : 0

  const newBonuses = bonuses - alreadyAwarded
  if (newBonuses <= 0) {
    return { stats: { ...stats }, initialStats: { ...initialStats } }
  }

  const currentLpMax =
    typeof initialStats['lifePoints'] === 'number' ? initialStats['lifePoints'] : 0

  const newInitialStats = {
    ...initialStats,
    lifePoints: currentLpMax + newBonuses,
    lifePointsXpBonuses: bonuses,
  }

  return { stats: { ...stats }, initialStats: newInitialStats }
}

export const grailQuest: GameSystem = {
  id: 'grail-quest',
  name: 'Grail Quest',
  stats: [
    {
      key: 'lifePoints',
      label: 'Life Points',
      min: 0,
      max: 48,
      initialDice: { count: 2, sides: 6, modifier: 0 },
    },
    {
      key: 'experiencePoints',
      label: 'Experience Points',
      min: 0,
    },
  ],
  primaryHealthStat: 'lifePoints',
  defaultDice: { count: 2, sides: 6, modifier: 0 },
}

gameSystemRegistry.register(grailQuest)
