/**
 * Minimal stub proving the GameSystem interface is implementable without
 * any Grail Quest-specific assumptions.
 *
 * NOT registered in the registry — used only at compile time to verify
 * the interface stays implementable as a second concrete type.
 */
import type { GameSystem } from './types'

export const testSystem: GameSystem = {
  id: 'test-system',
  name: 'Test System',
  stats: [],
  primaryHealthStat: 'hitPoints',
  defaultDice: { count: 2, sides: 6, modifier: 0 },
}
