import { describe, it, expect } from 'vitest'
import {
  grailQuest,
  XP_PER_LP,
  xpToLpBonuses,
  xpThresholdProgress,
  applyXpThreshold,
} from '../grail-quest'
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
    expect(lifePoints!.initialDice).toEqual({ count: 2, sides: 6, modifier: 0, multiplier: 4, bestOf: 3 })
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

  it('does not define initialMetadata (no gold or codewords for GQ)', () => {
    expect(grailQuest.initialMetadata).toBeUndefined()
  })
})

describe('XP_PER_LP', () => {
  it('is 20', () => {
    expect(XP_PER_LP).toBe(20)
  })
})

describe('xpToLpBonuses', () => {
  it('returns 0 for XP below the first threshold', () => {
    expect(xpToLpBonuses(0)).toBe(0)
    expect(xpToLpBonuses(19)).toBe(0)
  })

  it('returns 1 at exactly 20 XP', () => {
    expect(xpToLpBonuses(20)).toBe(1)
  })

  it('returns 1 for XP between 20 and 39', () => {
    expect(xpToLpBonuses(25)).toBe(1)
    expect(xpToLpBonuses(39)).toBe(1)
  })

  it('returns 2 at 40 XP', () => {
    expect(xpToLpBonuses(40)).toBe(2)
  })

  it('returns 3 at 60 XP', () => {
    expect(xpToLpBonuses(60)).toBe(3)
  })
})

describe('xpThresholdProgress', () => {
  it('returns 0/20 at 0 XP', () => {
    expect(xpThresholdProgress(0)).toEqual({ progress: 0, threshold: 20 })
  })

  it('returns 8/20 at 8 XP', () => {
    expect(xpThresholdProgress(8)).toEqual({ progress: 8, threshold: 20 })
  })

  it('returns 0/20 at exactly 20 XP (threshold just crossed)', () => {
    expect(xpThresholdProgress(20)).toEqual({ progress: 0, threshold: 20 })
  })

  it('returns 5/20 at 25 XP', () => {
    expect(xpThresholdProgress(25)).toEqual({ progress: 5, threshold: 20 })
  })
})

describe('applyXpThreshold', () => {
  it('does not change initialStats when XP is below first threshold', () => {
    const stats = { lifePoints: 10, experiencePoints: 15 }
    const initialStats = { lifePoints: 12 }
    const result = applyXpThreshold(stats, initialStats)
    expect(result.initialStats['lifePoints']).toBe(12)
    expect(result.initialStats['lifePointsXpBonuses']).toBeUndefined()
  })

  it('increments LP max by 1 when XP first crosses 20', () => {
    const stats = { lifePoints: 10, experiencePoints: 20 }
    const initialStats = { lifePoints: 12 }
    const result = applyXpThreshold(stats, initialStats)
    expect(result.initialStats['lifePoints']).toBe(13)
    expect(result.initialStats['lifePointsXpBonuses']).toBe(1)
  })

  it('does not double-award LP when called again at the same XP', () => {
    const stats = { lifePoints: 10, experiencePoints: 20 }
    const initialStats = { lifePoints: 13, lifePointsXpBonuses: 1 }
    const result = applyXpThreshold(stats, initialStats)
    expect(result.initialStats['lifePoints']).toBe(13)
    expect(result.initialStats['lifePointsXpBonuses']).toBe(1)
  })

  it('awards 2 LP bonuses when XP jumps from 0 to 40', () => {
    const stats = { lifePoints: 10, experiencePoints: 40 }
    const initialStats = { lifePoints: 12 }
    const result = applyXpThreshold(stats, initialStats)
    expect(result.initialStats['lifePoints']).toBe(14)
    expect(result.initialStats['lifePointsXpBonuses']).toBe(2)
  })

  it('awards 1 more LP when crossing from 25 XP to 40 XP (1 bonus already given)', () => {
    const stats = { lifePoints: 10, experiencePoints: 40 }
    const initialStats = { lifePoints: 13, lifePointsXpBonuses: 1 }
    const result = applyXpThreshold(stats, initialStats)
    expect(result.initialStats['lifePoints']).toBe(14)
    expect(result.initialStats['lifePointsXpBonuses']).toBe(2)
  })

  it('does not mutate original objects', () => {
    const stats = { lifePoints: 10, experiencePoints: 20 }
    const initialStats = { lifePoints: 12 }
    applyXpThreshold(stats, initialStats)
    expect(stats['lifePoints']).toBe(10)
    expect(initialStats['lifePoints']).toBe(12)
  })
})
