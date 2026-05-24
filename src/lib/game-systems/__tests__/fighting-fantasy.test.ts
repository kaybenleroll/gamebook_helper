import { describe, it, expect } from 'vitest'
import { fightingFantasy } from '../fighting-fantasy'
import { gameSystemRegistry } from '../registry'
import '../fighting-fantasy'

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
