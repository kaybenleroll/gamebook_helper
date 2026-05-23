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

export type CombatOutcome = 'in_progress' | 'player_won' | 'enemy_knocked_out' | 'player_lost' | 'player_fled'

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

export type EnemyStatField =
  | { key: string; label: string; type: 'number' | 'text'; required: boolean; default?: string | number }
  | { key: string; label: string; type: 'radio'; options: Array<{ value: string; label: string }>; required?: boolean; default?: string }

export type CombatModule = {
  enemyStatFields: Array<EnemyStatField>
  primaryEnemyHealthStat: string
  validateEnemyStats(input: unknown): string[]
  start(input: unknown, options?: { initiativeOverride?: 'player' | 'enemy' }): { enemyState: unknown; metadata: unknown; startNarrative?: string }
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

export interface SpellDefinition {
  id: string
  name: string
  maxUses: number
  hitCondition: string
  damage: number
}

export interface ConsumableDefinition {
  name: string
  itemType: 'potion' | 'salve'
  initialCount: number
  doseCount: number
  healAmount?: number
  healDice?: string
  description: string
}

export interface GameSystem {
  id: string
  name: string
  stats: StatDefinition[]
  primaryHealthStat: string
  defaultDice: DiceSpec
  combat?: CombatModule
  spells?: SpellDefinition[]
  consumables?: ConsumableDefinition[]
}
