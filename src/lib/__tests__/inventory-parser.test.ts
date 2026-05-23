import { describe, it, expect } from 'vitest'
import { parseInventoryTsv } from '../inventory-parser'

describe('parseInventoryTsv', () => {
  it('parses standard input with count and item name', () => {
    const input = '3  Provisions'
    expect(parseInventoryTsv(input)).toEqual([{ count: 3, itemName: 'Provisions' }])
  })

  it('parses multiple lines', () => {
    const input = '1\tBackpack\n4\tCandles\n3\tBalls of Twine'
    expect(parseInventoryTsv(input)).toEqual([
      { count: 1, itemName: 'Backpack' },
      { count: 4, itemName: 'Candles' },
      { count: 3, itemName: 'Balls of Twine' },
    ])
  })

  it('defaults count to 1 when count field is non-numeric', () => {
    const input = 'abc  Sword'
    expect(parseInventoryTsv(input)).toEqual([{ count: 1, itemName: 'Sword' }])
  })

  it('defaults count to 1 when count is zero', () => {
    const input = '0  Shield'
    expect(parseInventoryTsv(input)).toEqual([{ count: 1, itemName: 'Shield' }])
  })

  it('defaults count to 1 when count is negative', () => {
    const input = '-5  Dagger'
    expect(parseInventoryTsv(input)).toEqual([{ count: 1, itemName: 'Dagger' }])
  })

  it('trims leading and trailing whitespace from item name', () => {
    const input = '2\t  Leather Armour  '
    expect(parseInventoryTsv(input)).toEqual([{ count: 2, itemName: 'Leather Armour' }])
  })

  it('skips lines with no item name (only count token)', () => {
    const input = '3'
    expect(parseInventoryTsv(input)).toEqual([])
  })

  it('skips blank lines', () => {
    const input = '1\tBackpack\n\n2\tTorch\n'
    expect(parseInventoryTsv(input)).toEqual([
      { count: 1, itemName: 'Backpack' },
      { count: 2, itemName: 'Torch' },
    ])
  })

  it('handles tab delimiter', () => {
    const input = '5\tRope'
    expect(parseInventoryTsv(input)).toEqual([{ count: 5, itemName: 'Rope' }])
  })

  it('handles multiple-space delimiter', () => {
    const input = '2    Grappling Hook'
    expect(parseInventoryTsv(input)).toEqual([{ count: 2, itemName: 'Grappling Hook' }])
  })

  it('preserves spaces within item name', () => {
    const input = '1\tBalls of Twine'
    expect(parseInventoryTsv(input)).toEqual([{ count: 1, itemName: 'Balls of Twine' }])
  })

  it('returns empty array for empty string', () => {
    expect(parseInventoryTsv('')).toEqual([])
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseInventoryTsv('   \n  \n')).toEqual([])
  })

  it('skips lines where item name is blank after trimming', () => {
    const input = '1\tValid Item\n2\t   \n3\tAnother Item'
    expect(parseInventoryTsv(input)).toEqual([
      { count: 1, itemName: 'Valid Item' },
      { count: 3, itemName: 'Another Item' },
    ])
  })
})
