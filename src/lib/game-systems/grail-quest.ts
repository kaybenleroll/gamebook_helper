import type { GameSystem } from './types'
import { gameSystemRegistry } from './registry'

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
