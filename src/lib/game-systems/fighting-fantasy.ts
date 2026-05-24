import type { GameSystem } from './types'
import { gameSystemRegistry } from './registry'
import { rollDice } from '../dice'

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

  testLuck(
    characterStats: unknown,
    _initialStats: unknown,
  ): { roll: number; success: boolean; newLuck: number; message: string } {
    const stats = characterStats as Record<string, unknown>
    const currentLuck = typeof stats['luck'] === 'number' ? (stats['luck'] as number) : 0

    if (currentLuck <= 0) {
      throw new Error('Cannot test luck: current Luck is 0')
    }

    const dice = rollDice(2, 6)
    const roll = dice.reduce((a, b) => a + b, 0)
    const success = roll <= currentLuck
    const newLuck = currentLuck - 1

    const outcome = success ? 'Lucky!' : 'Unlucky!'
    const message = `Luck test: rolled ${roll} against Luck ${currentLuck} — ${outcome} Luck reduced to ${newLuck}.`

    return { roll, success, newLuck, message }
  },
}

gameSystemRegistry.register(fightingFantasy)
