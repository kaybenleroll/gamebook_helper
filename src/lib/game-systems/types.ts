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
  /**
   * If set, combat ends when enemy HP drops to or below this value.
   * Use 'enemy_knocked_out' outcome when HP is between 1 and this threshold;
   * use 'player_won' when HP reaches 0.
   * Systems without a knockout threshold leave this unset.
   */
  knockoutThreshold?: number
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
  /**
   * Optional post-combat hook called when the combat outcome is a player win
   * or enemy knockout. Returns XP gained and any stat deltas to apply.
   * Systems without post-combat awards may omit this method.
   */
  applyPostCombat?(
    combat: unknown,
    characterStats: unknown,
  ): { xpGained?: number; statDeltas?: Record<string, number> }
}

export interface SpellDefinition {
  id: string
  name: string
  maxUses: number
  hitCondition: string
  damage: number
}

export interface ConsumableDefinition {
  id?: string
  name: string
  itemType: 'potion' | 'salve' | 'provision'
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
  /**
   * Optional consumable-use handler. Computes the stat changes when a
   * consumable item is used, capping heals against initialStats values.
   * Returns the stat deltas to apply and a human-readable message.
   * Systems that do not support consumable stat effects may omit this.
   */
  applyConsumable?(
    item: unknown,
    characterStats: unknown,
    initialStats: unknown,
  ): { statDeltas: Record<string, number>; message: string }

  /**
   * Optional Test Your Luck mechanic. Rolls 2d6 against the character's
   * current Luck stat. Luck decrements by 1 regardless of outcome.
   * Returns the roll, whether it was a success, the new Luck value, and a
   * human-readable message.
   * Throws an error if the current Luck is 0.
   * Systems that do not have a Luck mechanic may omit this.
   */
  testLuck?(
    characterStats: unknown,
    initialStats: unknown,
  ): { roll: number; success: boolean; newLuck: number; message: string }

  /**
   * Optional hook to seed default session metadata on session creation.
   * Returns the metadata object to store when a new session is created.
   * Systems that need no default metadata may omit this (defaults to {}).
   */
  initialMetadata?(): import('../db/schema').SessionMetadata

  /**
   * Called after a stat is changed. Returns additional stat deltas to apply
   * (e.g. GQ XP threshold recalculation, LP-XP bonus resync).
   * Systems without post-stat-change side effects may omit this.
   */
  onStatChanged?(
    stat: string,
    newCurrentStats: Record<string, unknown>,
    newInitialStats: Record<string, unknown>,
  ): { currentDeltas?: Record<string, number>; initialDeltas?: Record<string, number> }

  /**
   * The stat key used for experience points, if this system tracks XP.
   * Used by combat routes to award XP and trigger the XP modal without
   * referencing system-specific string literals.
   * Systems without XP tracking leave this undefined.
   */
  experienceStatKey?: string
}
