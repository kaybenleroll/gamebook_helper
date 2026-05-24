// Shared types for the CombatPanel and its sub-components

import type { RoundOption } from '../../../../lib/game-systems/types'

export interface CombatRound {
  id: number
  roundNumber: number
  detail: Record<string, unknown>
  damageDealt: number
  damageTaken: number
  createdAt: string
}

export interface CombatData {
  id: number
  sessionId: number
  enemyName: string
  enemyStats: Record<string, unknown>
  enemyState: Record<string, unknown>
  metadata: Record<string, unknown>
  outcome: string
  startedAt: string
  endedAt: string | null
  availableRoundOptions?: RoundOption[]
  rounds: CombatRound[]
}

export interface LuckResult {
  type: 'attack' | 'defence'
  roll: number
  success: boolean
  delta: number
  message: string
}

// ---- HP calculation helpers ----

/** Resolves the current enemy HP using the system-aware field name.
 * Some systems (Grail Quest) store current HP under a 'current'-prefixed key;
 * others (Fighting Fantasy) store it directly under the primary health stat key. */
export function resolveEnemyHp(combat: CombatData, primaryEnemyHealthStat: string): { current: number; max: number } {
  const enemyCurrentHpKey =
    'current' + primaryEnemyHealthStat.charAt(0).toUpperCase() + primaryEnemyHealthStat.slice(1)
  const enemyStateRecord = (combat.enemyState as Record<string, unknown>) ?? {}
  const current =
    typeof enemyStateRecord[primaryEnemyHealthStat] === 'number'
      ? (enemyStateRecord[primaryEnemyHealthStat] as number)
      : typeof enemyStateRecord[enemyCurrentHpKey] === 'number'
        ? (enemyStateRecord[enemyCurrentHpKey] as number)
        : 0
  const max =
    typeof (combat.enemyStats as Record<string, unknown>)?.[primaryEnemyHealthStat] === 'number'
      ? ((combat.enemyStats as Record<string, unknown>)[primaryEnemyHealthStat] as number)
      : 0
  return { current, max }
}

// ---- API response shapes ----

export interface RoundApiResponse {
  round: CombatRound
  combat: {
    id: number
    outcome: string
    enemyState: Record<string, unknown>
    endedAt: string | null
    availableRoundOptions?: RoundOption[]
  }
  characterStats: Record<string, unknown>
  characterInitialStats: Record<string, unknown>
  xpPrompt?: boolean
}

export interface LuckTestApiResponse {
  roll: number
  success: boolean
  newLuck: number
  message: string
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
}

// ---- Combat state machine ----

export type CombatPhase =
  | { phase: 'idle' }
  | { phase: 'rolling' }
  | {
      phase: 'pendingCommit'
      damageDealt: number
      damageTaken: number
      phaseTwoSkipped: boolean
      luckAttackUsed: boolean
      luckDefenceUsed: boolean
      localLuckSpent: number
      luckResults: LuckResult[]
      overrideDamageDealt: string
      overrideDamageTaken: string
    }
  | { phase: 'finished' }

export type CombatAction =
  | { type: 'ROUND_RESOLVED'; damageDealt: number; damageTaken: number; phaseTwoSkipped: boolean }
  | { type: 'LUCK_TESTED'; luckType: 'attack' | 'defence'; result: LuckResult; newDamageDealt: string; newDamageTaken: string }
  | { type: 'OVERRIDE_DAMAGE_DEALT'; value: string }
  | { type: 'OVERRIDE_DAMAGE_TAKEN'; value: string }
  | { type: 'COMMITTED' }
  | { type: 'RESET_PENDING' }
  | { type: 'COMBAT_ENDED' }
  | { type: 'START_ROLLING' }

export function combatReducer(state: CombatPhase, action: CombatAction): CombatPhase {
  switch (action.type) {
    case 'START_ROLLING':
      return { phase: 'rolling' }

    case 'ROUND_RESOLVED':
      return {
        phase: 'pendingCommit',
        damageDealt: action.damageDealt,
        damageTaken: action.damageTaken,
        phaseTwoSkipped: action.phaseTwoSkipped,
        luckAttackUsed: false,
        luckDefenceUsed: false,
        localLuckSpent: 0,
        luckResults: [],
        overrideDamageDealt: String(action.damageDealt),
        overrideDamageTaken: String(action.damageTaken),
      }

    case 'LUCK_TESTED': {
      if (state.phase !== 'pendingCommit') return state
      return {
        ...state,
        luckAttackUsed: action.luckType === 'attack' ? true : state.luckAttackUsed,
        luckDefenceUsed: action.luckType === 'defence' ? true : state.luckDefenceUsed,
        localLuckSpent: state.localLuckSpent + 1,
        luckResults: [...state.luckResults, action.result],
        overrideDamageDealt: action.luckType === 'attack' ? action.newDamageDealt : state.overrideDamageDealt,
        overrideDamageTaken: action.luckType === 'defence' ? action.newDamageTaken : state.overrideDamageTaken,
      }
    }

    case 'OVERRIDE_DAMAGE_DEALT':
      if (state.phase !== 'pendingCommit') return state
      return { ...state, overrideDamageDealt: action.value }

    case 'OVERRIDE_DAMAGE_TAKEN':
      if (state.phase !== 'pendingCommit') return state
      return { ...state, overrideDamageTaken: action.value }

    case 'COMMITTED':
    case 'RESET_PENDING':
      return { phase: 'idle' }

    case 'COMBAT_ENDED':
      return { phase: 'finished' }

    default:
      return state
  }
}
