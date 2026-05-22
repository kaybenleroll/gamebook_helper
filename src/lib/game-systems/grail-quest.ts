import type { GameSystem, CombatModule, CombatState, RoundOption, CombatOutcome } from './types'
import { gameSystemRegistry } from './registry'
import { rollDice } from '../dice'

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

// ---- GQ combat type helpers ----

interface GqEnemyStats {
  name: string
  lifePoints: number
  xp?: number
}

interface GqEnemyState {
  currentLifePoints: number
}

interface GqMetadata {
  initiativeWinner: 'player' | 'enemy'
  playerRoll: number
  enemyRoll: number
  combatModifiers: Record<string, unknown>
  enemyXp: number
  playerThreshold: number
}

// ---- GQ combat module ----

export const grailQuestCombat: CombatModule = {
  enemyStatFields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'lifePoints', label: 'Life Points', type: 'number', required: true },
    { key: 'xp', label: 'XP reward', type: 'number', required: false },
    { key: 'enemyThreshold', label: 'Enemy hit threshold', type: 'number', required: false },
    { key: 'playerThreshold', label: 'Your hit threshold', type: 'number', required: false },
  ],

  validateEnemyStats(input: unknown): string[] {
    const errors: string[] = []
    if (!input || typeof input !== 'object') {
      return ['Enemy stats must be an object']
    }
    const s = input as Record<string, unknown>
    if (!s.name || typeof s.name !== 'string' || !s.name.trim()) {
      errors.push('name is required')
    }
    if (typeof s.lifePoints !== 'number' || !Number.isInteger(s.lifePoints) || s.lifePoints < 1) {
      errors.push('lifePoints must be a positive integer')
    }
    if (s.xp !== undefined && (typeof s.xp !== 'number' || s.xp < 0)) {
      errors.push('xp must be a non-negative number')
    }
    return errors
  },

  start(input: unknown): { enemyState: unknown; metadata: unknown } {
    const s = input as GqEnemyStats
    const lifePoints = typeof s.lifePoints === 'number' ? s.lifePoints : 0

    // Roll initiative — 2d6 each, re-roll on ties
    let playerRoll: number
    let enemyRoll: number
    do {
      playerRoll = rollDice(2, 6).reduce((a, b) => a + b, 0)
      enemyRoll = rollDice(2, 6).reduce((a, b) => a + b, 0)
    } while (playerRoll === enemyRoll)

    const initiativeWinner: 'player' | 'enemy' = playerRoll > enemyRoll ? 'player' : 'enemy'

    const enemyState: GqEnemyState = { currentLifePoints: lifePoints }
    const metadata: GqMetadata = {
      initiativeWinner,
      playerRoll,
      enemyRoll,
      combatModifiers: {},
      enemyXp: typeof s.xp === 'number' ? s.xp : 0,
      playerThreshold: (input as any).playerThreshold ?? 7,
    }

    return { enemyState, metadata }
  },

  roundOptions(_state: CombatState): RoundOption[] {
    return [
      {
        key: 'riskyAttack',
        label: 'Risky Attack (nose bop)',
        description: 'Raises your hit threshold by 2 — double damage on hit.',
        type: 'boolean',
        default: false,
      },
    ]
  },

  resolveRound(args: {
    enemyStats: unknown
    enemyState: unknown
    metadata: unknown
    characterStats: unknown
    chosenOptions: Record<string, unknown>
    combatModifiers: Record<string, unknown>
  }): {
    enemyState: unknown
    characterDeltas: Record<string, number>
    detail: unknown
    damageDealt: number
    damageTaken: number
    outcome: CombatOutcome | null
  } {
    const enemyState = args.enemyState as GqEnemyState
    const characterStats = args.characterStats as Record<string, unknown>
    const mods = args.combatModifiers as Record<string, unknown>

    const currentLifePoints =
      typeof enemyState.currentLifePoints === 'number' ? enemyState.currentLifePoints : 0
    const playerCurrentLp =
      typeof characterStats['lifePoints'] === 'number' ? (characterStats['lifePoints'] as number) : 0

    // Modifiers
    const damageBonus =
      typeof mods['damageBonus'] === 'number' ? (mods['damageBonus'] as number) : 0
    const playerThresholdOverride =
      typeof mods['playerThreshold'] === 'number' ? (mods['playerThreshold'] as number) : null

    const metadataRecord = args.metadata as GqMetadata
    const metadataPlayerThreshold =
      typeof metadataRecord?.playerThreshold === 'number' ? metadataRecord.playerThreshold : 7

    const riskyAttack = args.chosenOptions['riskyAttack'] === true

    // Player attack — roll 2d6; hit if ≥ threshold; damage = roll − 6
    const playerDice = rollDice(2, 6)
    const playerRoll = playerDice.reduce((s, r) => s + r, 0)
    const basePlayerThreshold = playerThresholdOverride ?? metadataPlayerThreshold
    const playerThreshold = riskyAttack ? basePlayerThreshold + 2 : basePlayerThreshold
    const playerHit = playerRoll >= playerThreshold
    const basePlayerDamage = playerHit ? Math.max(0, playerRoll - 6) : 0
    let damageDealt = 0
    if (playerHit) {
      const raw = basePlayerDamage + damageBonus
      damageDealt = riskyAttack ? raw * 2 : raw
    }

    // Enemy attack — roll 2d6; hit if ≥ enemyThreshold (default 7); damage = roll − 6
    const enemyDice = rollDice(2, 6)
    const enemyRoll = enemyDice.reduce((s, r) => s + r, 0)
    const enemyThreshold =
      typeof (args.enemyStats as any)?.enemyThreshold === 'number'
        ? (args.enemyStats as any).enemyThreshold as number
        : 7
    const enemyHit = enemyRoll >= enemyThreshold
    const damageTaken = enemyHit ? Math.max(0, enemyRoll - 6) : 0

    // Update enemy state
    const newCurrentLifePoints = Math.max(0, currentLifePoints - damageDealt)
    const newEnemyState: GqEnemyState = { currentLifePoints: newCurrentLifePoints }

    // Determine outcome
    let outcome: CombatOutcome | null = null
    if (newCurrentLifePoints <= 0) {
      outcome = 'player_won'
    } else if (playerCurrentLp - damageTaken <= 0) {
      outcome = 'player_lost'
    }

    // Build detail narrative
    const detail = {
      playerDice,
      playerRoll,
      playerThreshold,
      playerHit,
      damageDealt,
      enemyDice,
      enemyRoll,
      enemyThreshold,
      enemyHit,
      damageTaken,
      narrative: buildNarrative({
        playerDice,
        playerRoll,
        playerThreshold,
        playerHit,
        damageDealt,
        riskyAttack,
        enemyDice,
        enemyRoll,
        enemyThreshold,
        enemyHit,
        damageTaken,
      }),
    }

    return {
      enemyState: newEnemyState,
      characterDeltas: { lifePoints: -damageTaken },
      detail,
      damageDealt,
      damageTaken,
      outcome,
    }
  },
}

function buildNarrative(info: {
  playerDice: number[]
  playerRoll: number
  playerThreshold: number
  playerHit: boolean
  damageDealt: number
  riskyAttack: boolean
  enemyDice: number[]
  enemyRoll: number
  enemyThreshold: number
  enemyHit: boolean
  damageTaken: number
}): string {
  const diceStr = (dice: number[]) => `[${dice.join('+')}]=${dice.reduce((s, r) => s + r, 0)}`
  const playerPart = info.playerHit
    ? `Your attack ${diceStr(info.playerDice)} (≥${info.playerThreshold}, hit${info.riskyAttack ? ', risky' : ''}), dealt ${info.damageDealt} damage.`
    : `Your attack ${diceStr(info.playerDice)} (≥${info.playerThreshold} needed, miss).`
  const enemyPart = info.enemyHit
    ? `Enemy ${diceStr(info.enemyDice)} (≥${info.enemyThreshold}, hit), dealt ${info.damageTaken} damage.`
    : `Enemy ${diceStr(info.enemyDice)} (≥${info.enemyThreshold} needed, miss).`
  return `${playerPart} ${enemyPart}`
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
  combat: grailQuestCombat,
}

gameSystemRegistry.register(grailQuest)
