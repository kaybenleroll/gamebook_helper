import type { GameSystem } from './types'
import { gameSystemRegistry } from './registry'

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
  consumables: [],
}

gameSystemRegistry.register(fightingFantasy)
