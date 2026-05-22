export interface DiceSpec {
  count: number
  sides: number
  modifier: number
}

export interface StatDefinition {
  key: string
  label: string
  min: number
  max?: number
  initialDice?: DiceSpec
}

export interface GameSystem {
  id: string
  name: string
  stats: StatDefinition[]
  primaryHealthStat: string
  defaultDice: DiceSpec
}
