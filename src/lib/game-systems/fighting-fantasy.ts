import type { GameSystem, CombatModule, CombatState, RoundOption, CombatOutcome, ConsumableDefinition } from './types'
import { gameSystemRegistry } from './registry'
import { rollDice } from '../dice'

// ---- FF combat type helpers ----

export interface FfEnemyStats {
  skill: number
  stamina: number
}

export interface FfEnemyState {
  skill: number
  stamina: number
  initialStamina: number
}

export type FfMetadata = Record<string, unknown>

// ---- FF combat module ----

export const fightingFantasyCombat: CombatModule<FfEnemyStats, FfEnemyState, FfMetadata> = {
  knockoutThreshold: undefined,

  enemyStatFields: [
    { key: 'skill', label: 'Skill', type: 'number', required: true },
    { key: 'stamina', label: 'Stamina', type: 'number', required: true },
  ],
  primaryEnemyHealthStat: 'stamina',

  validateEnemyStats(input: unknown): string[] {
    const errors: string[] = []
    if (!input || typeof input !== 'object') {
      return ['Enemy stats must be an object']
    }
    const s = input as Record<string, unknown>
    if (typeof s.skill !== 'number' || !Number.isInteger(s.skill) || s.skill < 1) {
      errors.push('skill must be a positive integer')
    }
    if (typeof s.stamina !== 'number' || !Number.isInteger(s.stamina) || s.stamina < 1) {
      errors.push('stamina must be a positive integer')
    }
    return errors
  },

  start(input: FfEnemyStats): { enemyState: FfEnemyState; metadata: FfMetadata; startNarrative?: string } {
    const skill = typeof input.skill === 'number' ? input.skill : 0
    const stamina = typeof input.stamina === 'number' ? input.stamina : 0

    const enemyState: FfEnemyState = { skill, stamina, initialStamina: stamina }
    const metadata: FfMetadata = {}

    return { enemyState, metadata }
  },

  roundOptions(_state: CombatState<FfEnemyStats, FfEnemyState, FfMetadata>): RoundOption[] {
    return []
  },

  resolveRound(args: {
    enemyStats: FfEnemyStats
    enemyState: FfEnemyState
    metadata: FfMetadata
    characterStats: unknown
    chosenOptions: Record<string, unknown>
    combatModifiers: Record<string, unknown>
  }): {
    enemyState: FfEnemyState
    characterDeltas: Record<string, number>
    detail: unknown
    damageDealt: number
    damageTaken: number
    outcome: CombatOutcome | null
  } {
    const enemyState = args.enemyState
    const characterStats = args.characterStats as Record<string, unknown>

    const playerSkill = typeof characterStats['skill'] === 'number' ? (characterStats['skill'] as number) : 0
    const playerStamina = typeof characterStats['stamina'] === 'number' ? (characterStats['stamina'] as number) : 0
    const enemySkill = typeof enemyState.skill === 'number' ? enemyState.skill : 0
    const currentEnemyStamina = typeof enemyState.stamina === 'number' ? enemyState.stamina : 0

    // Roll 2d6 + SKILL = Attack Strength
    const playerRollResult = rollDice(2, 6)
    const playerDice = playerRollResult.attempts[0]!.dice
    const playerRoll = playerRollResult.attempts[0]!.total
    const playerAS = playerRoll + playerSkill

    const enemyRollResult = rollDice(2, 6)
    const enemyDice = enemyRollResult.attempts[0]!.dice
    const enemyRoll = enemyRollResult.attempts[0]!.total
    const enemyAS = enemyRoll + enemySkill

    let damageDealt = 0
    let damageTaken = 0
    let roundResult: 'player_hit' | 'enemy_hit' | 'tie'

    if (playerAS > enemyAS) {
      roundResult = 'player_hit'
      damageDealt = 2
    } else if (enemyAS > playerAS) {
      roundResult = 'enemy_hit'
      damageTaken = 2
    } else {
      roundResult = 'tie'
    }

    const newEnemyStamina = Math.max(0, currentEnemyStamina - damageDealt)
    const newEnemyState: FfEnemyState = {
      ...enemyState,
      stamina: newEnemyStamina,
    }

    const playerNewStamina = playerStamina - damageTaken

    let outcome: CombatOutcome | null = null
    if (newEnemyStamina <= 0) {
      outcome = 'player_won'
    } else if (playerNewStamina <= 0) {
      outcome = 'player_lost'
    }

    const narrative = buildFfNarrative({ playerAS, enemyAS, roundResult, damageDealt, damageTaken })

    const detail = {
      playerDice,
      playerRoll,
      playerAS,
      enemyDice,
      enemyRoll,
      enemyAS,
      roundResult,
      damageDealt,
      damageTaken,
      narrative,
    }

    return {
      enemyState: newEnemyState,
      characterDeltas: { stamina: damageTaken === 0 ? 0 : -damageTaken },
      detail,
      damageDealt,
      damageTaken,
      outcome,
    }
  },

  applyPostCombat(): { xpGained?: number; statDeltas?: Record<string, number> } {
    return {}
  },
}

function buildFfNarrative(info: {
  playerAS: number
  enemyAS: number
  roundResult: 'player_hit' | 'enemy_hit' | 'tie'
  damageDealt: number
  damageTaken: number
}): string {
  const asLine = `Your Attack Strength is ${info.playerAS}, the enemy's is ${info.enemyAS}.`
  if (info.roundResult === 'player_hit') {
    return `${asLine} You win the round, dealing ${info.damageDealt} damage.`
  } else if (info.roundResult === 'enemy_hit') {
    return `${asLine} The enemy wins the round, dealing ${info.damageTaken} damage.`
  } else {
    return `${asLine} The round is a tie — no damage.`
  }
}

// ---- FF consumables ----

const ffConsumables: ConsumableDefinition[] = [
  {
    id: 'provisions',
    name: 'Provisions',
    itemType: 'provision',
    initialCount: 10,
    doseCount: 10,
    healAmount: 4,
    description: 'Eat a meal to restore 4 STAMINA',
  },
]

export const fightingFantasy: GameSystem = {
  id: 'fighting-fantasy',
  name: 'Fighting Fantasy',
  stats: [
    {
      key: 'skill',
      label: 'Skill',
      min: 0,
      max: 12,
      initialDice: { count: 1, sides: 6, modifier: 6 },
    },
    {
      key: 'stamina',
      label: 'Stamina',
      min: 0,
      max: 24,
      initialDice: { count: 2, sides: 6, modifier: 12 },
    },
    {
      key: 'luck',
      label: 'Luck',
      min: 0,
      max: 12,
      initialDice: { count: 1, sides: 6, modifier: 6 },
    },
  ],
  primaryHealthStat: 'stamina',
  defaultDice: { count: 2, sides: 6, modifier: 0 },
  combat: fightingFantasyCombat,
  consumables: ffConsumables,

  applyConsumable(
    item: unknown,
    characterStats: unknown,
    initialStats: unknown,
  ): { statDeltas: Record<string, number>; message: string } {
    const i = item as { healAmount?: number | null; name?: string }
    const stats = characterStats as Record<string, unknown>
    const initial = initialStats as Record<string, unknown>

    const currentStamina =
      typeof stats['stamina'] === 'number' ? (stats['stamina'] as number) : 0
    const maxStamina =
      typeof initial['stamina'] === 'number' ? (initial['stamina'] as number) : 0

    const healAmount = typeof i.healAmount === 'number' ? i.healAmount : 4
    const actualHealed = Math.max(0, Math.min(healAmount, maxStamina - currentStamina))
    const itemName = typeof i.name === 'string' ? i.name : 'Provisions'

    return {
      statDeltas: { stamina: actualHealed },
      message: `You eat a provision and restore ${actualHealed} STAMINA.`,
    }
  },

  hasEquipment: false,
  hasGold: true,
  hasCodewords: true,
  backpackLimit: 10,

  initialMetadata(): import('../db/schema').SessionMetadata {
    return { gold: 0, codewords: [] }
  },

  testLuck(
    characterStats: unknown,
    _initialStats: unknown,
  ): { roll: number; success: boolean; newLuck: number; message: string } {
    const stats = characterStats as Record<string, unknown>
    const currentLuck = typeof stats['luck'] === 'number' ? (stats['luck'] as number) : 0

    if (currentLuck <= 0) {
      throw new Error('Cannot test luck: current Luck is 0')
    }

    const diceResult = rollDice(2, 6)
    const roll = diceResult.attempts[0]!.total
    const success = roll <= currentLuck
    const newLuck = currentLuck - 1

    const outcome = success ? 'Lucky!' : 'Unlucky!'
    const message = `Luck test: rolled ${roll} against Luck ${currentLuck} — ${outcome} Luck reduced to ${newLuck}.`

    return { roll, success, newLuck, message }
  },
}

gameSystemRegistry.register(fightingFantasy)
