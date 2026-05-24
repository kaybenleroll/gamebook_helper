import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fightingFantasy } from '../fighting-fantasy'
import { gameSystemRegistry } from '../registry'
import '../fighting-fantasy'
import * as diceModule from '../../dice'

describe('fightingFantasy system definition', () => {
  it('has the correct id and name', () => {
    expect(fightingFantasy.id).toBe('fighting-fantasy')
    expect(fightingFantasy.name).toBe('Fighting Fantasy')
  })

  it('uses stamina as the primary health stat', () => {
    expect(fightingFantasy.primaryHealthStat).toBe('stamina')
  })

  it('defines SKILL with correct bounds and initialDice', () => {
    const skill = fightingFantasy.stats.find(s => s.key === 'skill')
    expect(skill).toBeDefined()
    expect(skill!.label).toBe('Skill')
    expect(skill!.min).toBe(0)
    expect(skill!.max).toBe(12)
    expect(skill!.initialDice).toEqual({ count: 1, sides: 6, modifier: 6 })
    // No bestOf or worstOf — single roll
    expect(skill!.initialDice!.bestOf).toBeUndefined()
    expect(skill!.initialDice!.worstOf).toBeUndefined()
  })

  it('defines STAMINA with correct bounds and initialDice', () => {
    const stamina = fightingFantasy.stats.find(s => s.key === 'stamina')
    expect(stamina).toBeDefined()
    expect(stamina!.label).toBe('Stamina')
    expect(stamina!.min).toBe(0)
    expect(stamina!.max).toBe(24)
    expect(stamina!.initialDice).toEqual({ count: 2, sides: 6, modifier: 12 })
    expect(stamina!.initialDice!.bestOf).toBeUndefined()
    expect(stamina!.initialDice!.worstOf).toBeUndefined()
  })

  it('defines LUCK with correct bounds and initialDice', () => {
    const luck = fightingFantasy.stats.find(s => s.key === 'luck')
    expect(luck).toBeDefined()
    expect(luck!.label).toBe('Luck')
    expect(luck!.min).toBe(0)
    expect(luck!.max).toBe(12)
    expect(luck!.initialDice).toEqual({ count: 1, sides: 6, modifier: 6 })
    expect(luck!.initialDice!.bestOf).toBeUndefined()
    expect(luck!.initialDice!.worstOf).toBeUndefined()
  })

  it('has no combat module (slice 7)', () => {
    expect(fightingFantasy.combat).toBeUndefined()
  })

  it('has no spells', () => {
    expect(fightingFantasy.spells).toBeUndefined()
  })

  it('defines a Provisions consumable in the consumables array', () => {
    expect(fightingFantasy.consumables).toBeDefined()
    expect(fightingFantasy.consumables!.length).toBeGreaterThan(0)
    const provisions = fightingFantasy.consumables!.find((c) => c.name === 'Provisions')
    expect(provisions).toBeDefined()
    expect(provisions!.itemType).toBe('provision')
    expect(provisions!.initialCount).toBe(10)
    expect(provisions!.healAmount).toBe(4)
  })

  it('is registered in the global registry', () => {
    expect(gameSystemRegistry.get('fighting-fantasy')).toBe(fightingFantasy)
  })
})

describe('fightingFantasy stat ranges', () => {
  // Roll simulation: each stat is computed as sum of dice + modifier.
  // We verify the min and max possible values for each initialDice spec.

  it('SKILL rolls produce values in range 7..12 (1d6+6)', () => {
    const skill = fightingFantasy.stats.find(s => s.key === 'skill')!
    const { count, sides, modifier } = skill.initialDice!
    const minRoll = count * 1 + modifier   // all dice show 1
    const maxRoll = count * sides + modifier // all dice show max
    expect(minRoll).toBe(7)
    expect(maxRoll).toBe(12)
  })

  it('STAMINA rolls produce values in range 14..24 (2d6+12)', () => {
    const stamina = fightingFantasy.stats.find(s => s.key === 'stamina')!
    const { count, sides, modifier } = stamina.initialDice!
    const minRoll = count * 1 + modifier
    const maxRoll = count * sides + modifier
    expect(minRoll).toBe(14)
    expect(maxRoll).toBe(24)
  })

  it('LUCK rolls produce values in range 7..12 (1d6+6)', () => {
    const luck = fightingFantasy.stats.find(s => s.key === 'luck')!
    const { count, sides, modifier } = luck.initialDice!
    const minRoll = count * 1 + modifier
    const maxRoll = count * sides + modifier
    expect(minRoll).toBe(7)
    expect(maxRoll).toBe(12)
  })
})

describe('fightingFantasy stat ceiling enforcement', () => {
  it('STAMINA max does not exceed initialDice maximum (24)', () => {
    const stamina = fightingFantasy.stats.find(s => s.key === 'stamina')!
    // The stat's max property caps current value at creation and when adjusting
    expect(stamina.max).toBe(24)
    // The max possible roll (2d6+12 = 24) exactly meets the stat ceiling
    const { count, sides, modifier } = stamina.initialDice!
    const maxRoll = count * sides + modifier
    expect(maxRoll).toBeLessThanOrEqual(stamina.max!)
  })

  it('SKILL max does not exceed initialDice maximum (12)', () => {
    const skill = fightingFantasy.stats.find(s => s.key === 'skill')!
    expect(skill.max).toBe(12)
    const { count, sides, modifier } = skill.initialDice!
    const maxRoll = count * sides + modifier
    expect(maxRoll).toBeLessThanOrEqual(skill.max!)
  })

  it('LUCK max does not exceed initialDice maximum (12)', () => {
    const luck = fightingFantasy.stats.find(s => s.key === 'luck')!
    expect(luck.max).toBe(12)
    const { count, sides, modifier } = luck.initialDice!
    const maxRoll = count * sides + modifier
    expect(maxRoll).toBeLessThanOrEqual(luck.max!)
  })
})

describe('fightingFantasy testLuck', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rollDiceSpy: any

  beforeEach(() => {
    rollDiceSpy = vi.spyOn(diceModule, 'rollDice')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is defined on the fightingFantasy system', () => {
    expect(typeof fightingFantasy.testLuck).toBe('function')
  })

  it('succeeds when roll is less than or equal to current LUCK', () => {
    // Luck = 8, roll = 7 → success
    rollDiceSpy.mockReturnValue([3, 4])
    const stats = { skill: 10, stamina: 18, luck: 8 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.roll).toBe(7)
    expect(result.success).toBe(true)
  })

  it('succeeds when roll exactly equals current LUCK', () => {
    // Luck = 7, roll = 7 → success (equal counts as success)
    rollDiceSpy.mockReturnValue([3, 4])
    const stats = { skill: 10, stamina: 18, luck: 7 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.roll).toBe(7)
    expect(result.success).toBe(true)
  })

  it('fails when roll is greater than current LUCK', () => {
    // Luck = 6, roll = 9 → failure
    rollDiceSpy.mockReturnValue([4, 5])
    const stats = { skill: 10, stamina: 18, luck: 6 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.roll).toBe(9)
    expect(result.success).toBe(false)
  })

  it('decrements LUCK by 1 on success', () => {
    // Luck = 8, roll = 5 → success, newLuck should be 7
    rollDiceSpy.mockReturnValue([2, 3])
    const stats = { skill: 10, stamina: 18, luck: 8 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.newLuck).toBe(7)
  })

  it('decrements LUCK by 1 on failure', () => {
    // Luck = 6, roll = 11 → failure, newLuck should be 5
    rollDiceSpy.mockReturnValue([5, 6])
    const stats = { skill: 10, stamina: 18, luck: 6 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.newLuck).toBe(5)
  })

  it('blocks when LUCK is 0', () => {
    const stats = { skill: 10, stamina: 18, luck: 0 }
    expect(() => fightingFantasy.testLuck!(stats, stats)).toThrow()
  })

  it('LUCK cannot go below 0 — newLuck is 0 when starting from 1', () => {
    // Luck = 1 — any roll succeeds or fails; newLuck must be 0, not negative
    rollDiceSpy.mockReturnValue([1, 1])
    const stats = { skill: 10, stamina: 18, luck: 1 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(result.newLuck).toBe(0)
    expect(result.newLuck).toBeGreaterThanOrEqual(0)
  })

  it('returns a non-empty message string', () => {
    rollDiceSpy.mockReturnValue([3, 3])
    const stats = { skill: 10, stamina: 18, luck: 8 }
    const result = fightingFantasy.testLuck!(stats, stats)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })
})

describe('fightingFantasy initialMetadata', () => {
  it('is defined on the fightingFantasy system', () => {
    expect(typeof fightingFantasy.initialMetadata).toBe('function')
  })

  it('returns gold: 0', () => {
    const meta = fightingFantasy.initialMetadata!()
    expect(meta.gold).toBe(0)
  })

  it('returns codewords: []', () => {
    const meta = fightingFantasy.initialMetadata!()
    expect(meta.codewords).toEqual([])
  })

  it('returns a new object on each call', () => {
    const a = fightingFantasy.initialMetadata!()
    const b = fightingFantasy.initialMetadata!()
    expect(a).not.toBe(b)
  })

  it('returned codewords array is independent between calls', () => {
    const a = fightingFantasy.initialMetadata!()
    const b = fightingFantasy.initialMetadata!()
    ;(a.codewords as string[]).push('TEST')
    expect((b.codewords as string[]).length).toBe(0)
  })
})

describe('fightingFantasy applyConsumable', () => {
  it('is defined on the fightingFantasy system', () => {
    expect(typeof fightingFantasy.applyConsumable).toBe('function')
  })

  it('restores 4 STAMINA when used', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    const stats = { skill: 10, stamina: 14, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(result.statDeltas.stamina).toBe(4)
  })

  it('caps STAMINA at the initial value', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    // Current stamina is 18, max is 20 — only 2 can be healed
    const stats = { skill: 10, stamina: 18, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(result.statDeltas.stamina).toBe(2)
  })

  it('returns 0 stamina delta when STAMINA is already at max', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    const stats = { skill: 10, stamina: 20, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(result.statDeltas.stamina).toBe(0)
  })

  it('returns statDeltas with a stamina key', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    const stats = { skill: 10, stamina: 10, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(result.statDeltas).toHaveProperty('stamina')
  })

  it('returns a non-empty message string', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    const stats = { skill: 10, stamina: 14, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('message mentions the amount of STAMINA restored', () => {
    const provisions = { name: 'Provisions', itemType: 'provision', healAmount: 4 }
    const stats = { skill: 10, stamina: 14, luck: 8 }
    const initialStats = { skill: 10, stamina: 20, luck: 8 }
    const result = fightingFantasy.applyConsumable!(provisions, stats, initialStats)
    expect(result.message).toContain('4')
    expect(result.message.toLowerCase()).toContain('stamina')
  })
})
