import { describe, it, expect } from 'vitest'
import { grailQuest } from '../grail-quest'
import { gameSystemRegistry } from '../registry'
import '../grail-quest'

describe('grailQuest system definition', () => {
  it('has the correct id and name', () => {
    expect(grailQuest.id).toBe('grail-quest')
    expect(grailQuest.name).toBe('Grail Quest')
  })

  it('uses lifePoints as the primary health stat', () => {
    expect(grailQuest.primaryHealthStat).toBe('lifePoints')
  })

  it('defines lifePoints with correct bounds and initialDice', () => {
    const lifePoints = grailQuest.stats.find(s => s.key === 'lifePoints')
    expect(lifePoints).toBeDefined()
    expect(lifePoints!.min).toBe(0)
    expect(lifePoints!.max).toBe(48)
    expect(lifePoints!.initialDice).toEqual({ count: 2, sides: 6, modifier: 0 })
  })

  it('defines experiencePoints starting at 0 with no upper bound', () => {
    const xp = grailQuest.stats.find(s => s.key === 'experiencePoints')
    expect(xp).toBeDefined()
    expect(xp!.min).toBe(0)
    expect(xp!.max).toBeUndefined()
    expect(xp!.initialDice).toBeUndefined()
  })

  it('is registered in the global registry', () => {
    expect(gameSystemRegistry.get('grail-quest')).toBe(grailQuest)
  })
})
