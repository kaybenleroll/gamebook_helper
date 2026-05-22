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
  skill: number
  stamina: number
  damage: number
  xp?: number
}

interface GqEnemyState {
  currentStamina: number
}

interface GqMetadata {
  initiativeWinner: 'player' | 'enemy' | 'tied'
  playerRoll: number
  enemyRoll: number
  combatModifiers: Record<string, unknown>
  enemyXp: number
}

// ---- GQ combat module ----

export const grailQuestCombat: CombatModule = {
  enemyStatFields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'skill', label: 'Skill', type: 'number', required: true },
    { key: 'stamina', label: 'Stamina', type: 'number', required: true },
    { key: 'damage', label: 'Damage', type: 'number', required: false },
    { key: 'xp', label: 'XP reward', type: 'number', required: false },
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
    if (typeof s.skill !== 'number' || s.skill < 1) {
      errors.push('skill must be a positive number')
    }
    if (typeof s.stamina !== 'number' || s.stamina < 1) {
      errors.push('stamina must be a positive number')
    }
    if (s.damage !== undefined && (typeof s.damage !== 'number' || s.damage < 0)) {
      errors.push('damage must be a non-negative number')
    }
    if (s.xp !== undefined && (typeof s.xp !== 'number' || s.xp < 0)) {
      errors.push('xp must be a non-negative number')
    }
    return errors
  },

  start(input: unknown): { enemyState: unknown; metadata: unknown } {
    const s = input as GqEnemyStats
    const skill = typeof s.skill === 'number' ? s.skill : 0
    const stamina = typeof s.stamina === 'number' ? s.stamina : 0

    // Roll initiative — keep re-rolling on ties
    let playerRoll: number
    let enemyRoll: number
    do {
      playerRoll = rollDice(1, 6)[0] + skill
      enemyRoll = rollDice(1, 6)[0] + skill
    } while (playerRoll === enemyRoll)

    const initiativeWinner: 'player' | 'enemy' = playerRoll > enemyRoll ? 'player' : 'enemy'

    const enemyState: GqEnemyState = { currentStamina: stamina }
    const metadata: GqMetadata = {
      initiativeWinner,
      playerRoll,
      enemyRoll,
      combatModifiers: {},
      enemyXp: typeof s.xp === 'number' ? s.xp : 0,
    }

    return { enemyState, metadata }
  },

  roundOptions(_state: CombatState): RoundOption[] {
    return [
      {
        key: 'riskyAttack',
        label: 'Risky Attack',
        description: 'Target threshold 8 instead of 7, but deal double damage on hit.',
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
    const enemyStats = args.enemyStats as GqEnemyStats
    const enemyState = args.enemyState as GqEnemyState
    const characterStats = args.characterStats as Record<string, unknown>
    const mods = args.combatModifiers as Record<string, unknown>

    const playerSkill =
      typeof characterStats['skill'] === 'number' ? (characterStats['skill'] as number) : 0
    const playerCurrentStamina =
      typeof characterStats['lifePoints'] === 'number' ? (characterStats['lifePoints'] as number) : 0

    const enemySkill = typeof enemyStats.skill === 'number' ? enemyStats.skill : 0
    const enemyDamage = typeof enemyStats.damage === 'number' ? enemyStats.damage : 2

    // Modifiers
    const attackBonus =
      typeof mods['attackBonus'] === 'number' ? (mods['attackBonus'] as number) : 0
    const damageBonus =
      typeof mods['damageBonus'] === 'number' ? (mods['damageBonus'] as number) : 0
    const playerThresholdOverride =
      typeof mods['playerThreshold'] === 'number' ? (mods['playerThreshold'] as number) : null

    const riskyAttack = args.chosenOptions['riskyAttack'] === true

    // Player attack
    const playerAttackDice = rollDice(2, 6)
    const playerAttackRoll = playerAttackDice.reduce((s, r) => s + r, 0) + playerSkill + attackBonus
    const playerThreshold = playerThresholdOverride ?? (riskyAttack ? 8 : 7)
    const playerHit = playerAttackRoll >= playerThreshold
    const baseDamageDealt = 2 // GQ default player damage (unarmed or armed baseline)
    let damageDealt = 0
    if (playerHit) {
      const raw = baseDamageDealt + damageBonus
      damageDealt = riskyAttack ? raw * 2 : raw
    }

    // Enemy attack
    const enemyAttackDice = rollDice(2, 6)
    const enemyAttackRoll = enemyAttackDice.reduce((s, r) => s + r, 0) + enemySkill
    const enemyThreshold = 7
    const enemyHit = enemyAttackRoll >= enemyThreshold
    const damageTaken = enemyHit ? enemyDamage : 0

    // Update enemy state
    const newEnemyStamina = Math.max(0, enemyState.currentStamina - damageDealt)
    const newEnemyState: GqEnemyState = { currentStamina: newEnemyStamina }

    // Determine outcome
    let outcome: CombatOutcome | null = null
    if (newEnemyStamina <= 0) {
      outcome = 'player_won'
    } else if (playerCurrentStamina - damageTaken <= 0) {
      outcome = 'player_lost'
    }

    // Build detail narrative
    const detail = {
      playerAttack: {
        dice: playerAttackDice,
        roll: playerAttackRoll,
        threshold: playerThreshold,
        hit: playerHit,
        damageDealt,
        riskyAttack,
      },
      enemyAttack: {
        dice: enemyAttackDice,
        roll: enemyAttackRoll,
        threshold: enemyThreshold,
        hit: enemyHit,
        damageTaken,
      },
      narrative: buildNarrative({
        playerAttackDice,
        playerAttackRoll,
        playerThreshold,
        playerHit,
        damageDealt,
        riskyAttack,
        enemyAttackDice,
        enemyAttackRoll,
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
  playerAttackDice: number[]
  playerAttackRoll: number
  playerThreshold: number
  playerHit: boolean
  damageDealt: number
  riskyAttack: boolean
  enemyAttackDice: number[]
  enemyAttackRoll: number
  enemyThreshold: number
  enemyHit: boolean
  damageTaken: number
}): string {
  const diceStr = (dice: number[]) => `[${dice.join('+')}]=${dice.reduce((s, r) => s + r, 0)}`
  const playerPart = info.playerHit
    ? `Your attack ${diceStr(info.playerAttackDice)}+skill=${info.playerAttackRoll} (≥${info.playerThreshold} hit${info.riskyAttack ? ', risky' : ''}), dealt ${info.damageDealt} damage.`
    : `Your attack ${diceStr(info.playerAttackDice)}+skill=${info.playerAttackRoll} (≥${info.playerThreshold} needed, miss).`
  const enemyPart = info.enemyHit
    ? `Enemy ${diceStr(info.enemyAttackDice)}+skill=${info.enemyAttackRoll} (≥${info.enemyThreshold} hit), dealt ${info.damageTaken} damage.`
    : `Enemy ${diceStr(info.enemyAttackDice)}+skill=${info.enemyAttackRoll} (≥${info.enemyThreshold} needed, miss).`
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
