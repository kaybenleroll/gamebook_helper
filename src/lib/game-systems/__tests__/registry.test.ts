import { describe, it, expect, beforeEach } from 'vitest'
import { GameSystemRegistry } from '../registry'
import type { GameSystem } from '../types'

const mockSystem: GameSystem = {
  id: 'test-system',
  name: 'Test System',
  stats: [
    { key: 'health', label: 'Health', min: 0, max: 20, initialDice: { count: 2, sides: 6, modifier: 6 } },
    { key: 'skill', label: 'Skill', min: 0, initialDice: { count: 1, sides: 6, modifier: 6 } },
  ],
  primaryHealthStat: 'health',
  defaultDice: { count: 2, sides: 6, modifier: 0 },
}

describe('GameSystemRegistry', () => {
  let registry: GameSystemRegistry

  beforeEach(() => {
    registry = new GameSystemRegistry()
  })

  it('registers and retrieves a system by ID', () => {
    registry.register(mockSystem)
    expect(registry.get('test-system')).toBe(mockSystem)
  })

  it('lists all registered systems', () => {
    registry.register(mockSystem)
    expect(registry.list()).toHaveLength(1)
    expect(registry.list()[0]).toBe(mockSystem)
  })

  it('throws a typed error for an unknown system ID', () => {
    expect(() => registry.get('unknown')).toThrow('Unknown game system: "unknown"')
  })

  it('list returns empty array when no systems registered', () => {
    expect(registry.list()).toEqual([])
  })
})
