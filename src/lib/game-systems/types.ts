export interface DiceSpec {
  count: number
  sides: number
  modifier: number
  multiplier?: number
  bestOf?: number
  worstOf?: number
}

export interface StatDefinition {
  key: string
  label: string
  min: number
  max?: number
  initialDice?: DiceSpec
}

export type CombatOutcome = 'in_progress' | 'player_won' | 'player_lost' | 'player_fled'

export type RoundOption = {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number'
  default: boolean | number
}

export type CombatState = {
  enemyStats: unknown
  enemyState: unknown
  metadata: unknown
  characterStats: unknown
}

export type CombatModule = {
  enemyStatFields: Array<{ key: string; label: string; type: 'number' | 'text'; required: boolean }>
  validateEnemyStats(input: unknown): string[]
  start(input: unknown): { enemyState: unknown; metadata: unknown }
  roundOptions(state: CombatState): RoundOption[]
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
  }
}

export interface GameSystem {
  id: string
  name: string
  stats: StatDefinition[]
  primaryHealthStat: string
  defaultDice: DiceSpec
  combat?: CombatModule
}
