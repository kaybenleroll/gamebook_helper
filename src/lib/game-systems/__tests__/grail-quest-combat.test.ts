import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { grailQuestCombat } from '../grail-quest'

// ---- Helpers ----

function makeEnemyStats(overrides?: Partial<{ name: string; lifePoints: number; xp: number; enemyThreshold: number; playerThreshold: number }>) {
  return { name: 'Goblin', lifePoints: 8, ...overrides }
}

function makeEnemyState(currentLifePoints: number) {
  return { currentLifePoints }
}

function makeCharacterStats(overrides?: Partial<{ lifePoints: number; experiencePoints: number }>) {
  return { lifePoints: 10, experiencePoints: 0, ...overrides }
}

// Default metadata: playerThreshold 6, enemyThreshold comes from enemyStats
const defaultMetadata = { playerThreshold: 6 }

function resolveWith(
  opts: {
    enemyStats?: ReturnType<typeof makeEnemyStats>
    enemyState?: ReturnType<typeof makeEnemyState>
    characterStats?: ReturnType<typeof makeCharacterStats>
    chosenOptions?: Record<string, unknown>
    combatModifiers?: Record<string, unknown>
    metadata?: Record<string, unknown>
  } = {},
) {
  return grailQuestCombat.resolveRound({
    enemyStats: opts.enemyStats ?? makeEnemyStats(),
    enemyState: opts.enemyState ?? makeEnemyState(8),
    metadata: opts.metadata ?? defaultMetadata,
    characterStats: opts.characterStats ?? makeCharacterStats(),
    chosenOptions: opts.chosenOptions ?? {},
    combatModifiers: opts.combatModifiers ?? {},
  })
}

// ---- Tests ----

describe('enemyStatFields', () => {
  it('has no skill field', () => {
    const keys = grailQuestCombat.enemyStatFields.map((f) => f.key)
    expect(keys).not.toContain('skill')
  })

  it('has lifePoints not stamina', () => {
    const keys = grailQuestCombat.enemyStatFields.map((f) => f.key)
    expect(keys).toContain('lifePoints')
    expect(keys).not.toContain('stamina')
  })

  it('has no damage field', () => {
    const keys = grailQuestCombat.enemyStatFields.map((f) => f.key)
    expect(keys).not.toContain('damage')
  })

  it('has name and xp fields', () => {
    const keys = grailQuestCombat.enemyStatFields.map((f) => f.key)
    expect(keys).toContain('name')
    expect(keys).toContain('xp')
  })
})

describe('validateEnemyStats', () => {
  it('returns empty array for valid stats', () => {
    expect(grailQuestCombat.validateEnemyStats({ name: 'Troll', lifePoints: 12 })).toEqual([])
  })

  it('requires name', () => {
    const errs = grailQuestCombat.validateEnemyStats({ lifePoints: 6 })
    expect(errs).toContain('name is required')
  })

  it('rejects missing lifePoints', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X' })
    expect(errs.some((e) => e.includes('lifePoints'))).toBe(true)
  })

  it('rejects lifePoints of 0', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', lifePoints: 0 })
    expect(errs.some((e) => e.includes('lifePoints'))).toBe(true)
  })

  it('rejects non-integer lifePoints', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', lifePoints: 2.5 })
    expect(errs.some((e) => e.includes('lifePoints'))).toBe(true)
  })

  it('accepts optional xp', () => {
    expect(grailQuestCombat.validateEnemyStats({ name: 'X', lifePoints: 5, xp: 10 })).toEqual([])
  })

  it('rejects negative xp', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', lifePoints: 5, xp: -1 })
    expect(errs.some((e) => e.includes('xp'))).toBe(true)
  })
})

describe('start', () => {
  it('sets enemyState.currentLifePoints to enemyStats.lifePoints', () => {
    const { enemyState } = grailQuestCombat.start(makeEnemyStats({ lifePoints: 14 })) as {
      enemyState: Record<string, unknown>
    }
    expect(enemyState['currentLifePoints']).toBe(14)
  })

  it('resolves initiative without a tie result (2d6 each)', () => {
    const { metadata } = grailQuestCombat.start(makeEnemyStats()) as {
      enemyState: Record<string, unknown>
      metadata: Record<string, unknown>
    }
    expect(['player', 'enemy']).toContain(metadata['initiativeWinner'])
    expect(typeof metadata['playerRoll']).toBe('number')
    expect(typeof metadata['enemyRoll']).toBe('number')
    expect(metadata['playerRoll']).not.toBe(metadata['enemyRoll'])
  })

  it('stores enemyXp from input', () => {
    const { metadata } = grailQuestCombat.start(makeEnemyStats({ xp: 25 })) as {
      metadata: Record<string, unknown>
    }
    expect(metadata['enemyXp']).toBe(25)
  })
})

// Hit condition: roll > threshold (strictly greater than).
// Damage formula: (roll − threshold) + playerDamageBonus − enemyArmourReduction, minimum 0.
// Default metadata uses playerThreshold: 6, default enemyThreshold: 6.

describe('resolveRound — basic hit / miss mechanics', () => {
  it('roll > 6 is a hit; damage = roll − threshold (no bonuses)', () => {
    // Force 2d6 → [3,4]=7 > 6 → hit; damage = 7 − 6 = 1
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((3 - 1) / 6)  // player die 1: 3
      .mockReturnValueOnce((4 - 1) / 6)  // player die 2: 4 → sum 7
      .mockReturnValueOnce(0)             // enemy dice (miss)
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith()
      expect(result.damageDealt).toBe(1) // 7 − 6 = 1
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll exactly 6 → miss (6 is NOT > 6)', () => {
    // [3+3]=6: strictly NOT greater than threshold 6 → miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((3 - 1) / 6)  // player die 1: 3
      .mockReturnValueOnce((3 - 1) / 6)  // player die 2: 3 → sum 6
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith()
      const detail = result.detail as Record<string, unknown>
      expect(detail['playerHit']).toBe(false)
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll exactly 7 → hit; damage = 7 − 6 = 1', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((3 - 1) / 6)
      .mockReturnValueOnce((4 - 1) / 6)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith()
      expect(result.damageDealt).toBe(1)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 12 (max) → hit; damage = 12 − 6 = 6', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // always max face
    try {
      const result = resolveWith()
      // Player hits with 12 > 6; damage = 12 − 6 = 6
      expect(result.damageDealt).toBe(6)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 5 → miss, 0 damage (5 is not > 6)', () => {
    // [2+3]=5 → miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((2 - 1) / 6)  // player die 1: 2
      .mockReturnValueOnce((3 - 1) / 6)  // player die 2: 3 → sum 5
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith()
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 2 (min) → miss, 0 damage', () => {
    // [1+1]=2 → miss
    vi.spyOn(Math, 'random').mockReturnValue(0) // always min face (1)
    try {
      const result = resolveWith()
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — risky attack (nose bop)', () => {
  it('uses threshold 8 for risky attack (default 6 + 2)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      const detail = risky.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(8)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('uses threshold 6 for normal attack', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const detail = normal.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(6)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 10 risky attack (threshold 8) → damage = (10−8)×2 = 4', () => {
    // Force player dice [5+5]=10 > 8 → hit; damage = (10−8)×2 = 4; enemy miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((5 - 1) / 6)  // player die 1: 5
      .mockReturnValueOnce((5 - 1) / 6)  // player die 2: 5 → sum 10
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ chosenOptions: { riskyAttack: true } })
      expect(result.damageDealt).toBe(4) // (10−8)×2
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 8 risky attack (threshold 8) → miss (8 is NOT > 8)', () => {
    // Force player dice [4+4]=8, enemy dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((4 - 1) / 6)
      .mockReturnValueOnce((4 - 1) / 6)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ chosenOptions: { riskyAttack: true } })
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('risky hit deals doubled (roll − riskyThreshold) damage compared to normal (roll − normalThreshold)', () => {
    // Roll 12 (max). Normal: threshold 6, damage = 12−6 = 6. Risky: threshold 8, damage = (12−8)×2 = 8.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      expect(normal.damageDealt).toBe(6) // 12 − 6
      expect(risky.damageDealt).toBe(8)  // (12 − 8) × 2
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — enemy attack', () => {
  it('enemy roll > 6 hits player; damage = (enemyRoll − threshold) (no bonuses/armour)', () => {
    // Force enemy dice [6+6]=12 > 6 → hit; damage = 12 − 6 = 6; player dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)    // player die 1: 1
      .mockReturnValueOnce(0)    // player die 2: 1 → miss
      .mockReturnValueOnce(0.99) // enemy die 1: 6
      .mockReturnValueOnce(0.99) // enemy die 2: 6 → sum 12, damage 6
    try {
      const result = resolveWith()
      expect(result.damageTaken).toBe(6)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemy roll exactly 6 → miss (6 is NOT > 6)', () => {
    // Force player miss, enemy [3+3]=6 → miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)             // player die 1: 1
      .mockReturnValueOnce(0)             // player die 2: 1 → miss
      .mockReturnValueOnce((3 - 1) / 6)  // enemy die 1: 3
      .mockReturnValueOnce((3 - 1) / 6)  // enemy die 2: 3 → sum 6 → miss
    try {
      const result = resolveWith()
      expect(result.damageTaken).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemy roll ≤ 5 → miss, 0 damage to player', () => {
    // [1+1]=2 → miss (2 < 6)
    vi.spyOn(Math, 'random').mockReturnValue(0) // all dice roll 1 → sum 2 < 6
    try {
      const result = resolveWith()
      expect(result.damageTaken).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — win/lose conditions', () => {
  it('returns player_won when enemy currentLifePoints drops to 0', () => {
    // Enemy starts at 6 LP; player roll 12 > 6 → damage = 6 → 6 − 6 = 0 LP
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // force high rolls
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(6),
        characterStats: makeCharacterStats({ lifePoints: 20 }),
      })
      expect(result.outcome).toBe('player_won')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns null when enemy LP > 0 after hit (combat continues)', () => {
    // Enemy starts at 7 LP; player roll 12 → damage 6 → 7 − 6 = 1 LP remaining
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // force max roll (12)
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(7),
        characterStats: makeCharacterStats({ lifePoints: 20 }),
      })
      expect(result.outcome).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns player_lost when player lifePoints would reach 0', () => {
    // Force player to miss, enemy to deal fatal damage
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)    // player die 1: 1
      .mockReturnValueOnce(0)    // player die 2: 1 → miss
      .mockReturnValueOnce(0.99) // enemy die 1: 6
      .mockReturnValueOnce(0.99) // enemy die 2: 6 → sum 12, damage 6
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(100),
        characterStats: makeCharacterStats({ lifePoints: 1 }),
      })
      expect(result.damageTaken).toBe(6)
      expect(result.outcome).toBe('player_lost')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns null when combat continues', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // all dice 1 → all misses
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(20),
        characterStats: makeCharacterStats({ lifePoints: 20 }),
      })
      expect(result.damageDealt).toBe(0)
      expect(result.damageTaken).toBe(0)
      expect(result.outcome).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — combat modifiers', () => {
  it('applies playerThreshold override from combatModifiers', () => {
    // Override threshold to 1 → roll 2 (all dice=1) > 1 → hit
    vi.spyOn(Math, 'random').mockReturnValue(0) // dice always 1 → sum 2
    try {
      const normal = resolveWith()
      // 2 is not > 6 → miss
      expect(normal.damageDealt).toBe(0)

      // Override threshold to 1 → roll 2 > 1 → hit, damage = 2 − 1 = 1
      const overrideThreshold = resolveWith({
        combatModifiers: { playerThreshold: 1 },
      })
      const detail = overrideThreshold.detail as Record<string, unknown>
      expect(detail['playerHit']).toBe(true)
      expect(overrideThreshold.damageDealt).toBe(1) // 2 − 1 = 1
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('applies playerDamageBonus from metadata on top of base damage', () => {
    // Roll 12 > 6 → base damage = 12 − 6 = 6; with playerDamageBonus 3 → 9
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // max dice → roll 12
    try {
      const normal = resolveWith()
      const withBonus = resolveWith({ metadata: { playerThreshold: 6, playerDamageBonus: 3 } })
      expect(withBonus.damageDealt).toBe(normal.damageDealt + 3)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — configurable thresholds', () => {
  it('playerThreshold 4: roll 5 → hit (5 > 4)', () => {
    // Force player dice [3+2]=5, enemy dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((3 - 1) / 6)  // player die 1: 3
      .mockReturnValueOnce((2 - 1) / 6)  // player die 2: 2 → sum 5
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ metadata: { playerThreshold: 4 } })
      const detail = result.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(4)
      expect(detail['playerHit']).toBe(true) // 5 > 4
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('playerThreshold 4: roll 4 → miss (4 is NOT > 4)', () => {
    // Force player dice [2+2]=4, enemy dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((2 - 1) / 6)  // player die 1: 2
      .mockReturnValueOnce((2 - 1) / 6)  // player die 2: 2 → sum 4
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ metadata: { playerThreshold: 4 } })
      const detail = result.detail as Record<string, unknown>
      expect(detail['playerHit']).toBe(false) // 4 is NOT > 4
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('playerThreshold 4: roll 3 → miss (3 < 4)', () => {
    // Force player dice [2+1]=3, enemy dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((2 - 1) / 6)  // player die 1: 2
      .mockReturnValueOnce((1 - 1) / 6)  // player die 2: 1 → sum 3
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ metadata: { playerThreshold: 4 } })
      const detail = result.detail as Record<string, unknown>
      expect(detail['playerHit']).toBe(false) // 3 < 4
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemyThreshold 9: enemy roll 9 → miss (9 is NOT > 9)', () => {
    // Force player dice miss, enemy dice [5+4]=9
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)             // player die 1: 1
      .mockReturnValueOnce(0)             // player die 2: 1 → miss
      .mockReturnValueOnce((5 - 1) / 6)  // enemy die 1: 5
      .mockReturnValueOnce((4 - 1) / 6)  // enemy die 2: 4 → sum 9 → miss
    try {
      const result = resolveWith({ enemyStats: makeEnemyStats({ enemyThreshold: 9 }) })
      const detail = result.detail as Record<string, unknown>
      expect(detail['enemyThreshold']).toBe(9)
      expect(detail['enemyHit']).toBe(false) // 9 is NOT > 9
      expect(result.damageTaken).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemyThreshold 9: enemy roll 10 → hit; damage = 10 − 9 = 1', () => {
    // Force player dice miss, enemy dice [5+5]=10
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)             // player die 1: 1
      .mockReturnValueOnce(0)             // player die 2: 1 → miss
      .mockReturnValueOnce((5 - 1) / 6)  // enemy die 1: 5
      .mockReturnValueOnce((5 - 1) / 6)  // enemy die 2: 5 → sum 10 > 9 → hit
    try {
      const result = resolveWith({ enemyStats: makeEnemyStats({ enemyThreshold: 9 }) })
      const detail = result.detail as Record<string, unknown>
      expect(detail['enemyHit']).toBe(true) // 10 > 9
      expect(result.damageTaken).toBe(1)    // 10 − 9 = 1
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('risky attack uses playerThreshold + 2, not hardcoded', () => {
    // With playerThreshold 4, risky should use threshold 6
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const result = resolveWith({
        metadata: { playerThreshold: 4 },
        chosenOptions: { riskyAttack: true },
      })
      const detail = result.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(6) // 4 + 2
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('roundOptions', () => {
  it('always includes riskyAttack option with correct properties', () => {
    const opts = grailQuestCombat.roundOptions({
      enemyStats: makeEnemyStats(),
      enemyState: makeEnemyState(8),
      metadata: {},
      characterStats: makeCharacterStats(),
    })
    const riskyOpt = opts.find((o) => o.key === 'riskyAttack')
    expect(riskyOpt).toBeDefined()
    expect(riskyOpt?.type).toBe('boolean')
    expect(riskyOpt?.default).toBe(false)
  })
})

describe('initiative tie re-roll', () => {
  it('resolves without infinite loop even when first rolls tie', () => {
    // Attempt 1: player 2d6 = [4,4]=8, enemy 2d6 = [4,4]=8 → tie
    // Attempt 2: player 2d6 = [1,1]=2, enemy 2d6 = [6,6]=12 → different → winner is enemy
    // Mock sequence: 4 values of 0.5 (floor(0.5*6)+1=4), then 2 values of 0 (→1) and 2 values of 0.99 (→6)
    const sequence = [0.5, 0.5, 0.5, 0.5, 0, 0, 0.99, 0.99]
    let callCount = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const value = sequence[callCount] ?? 0.5
      callCount++
      return value
    })
    try {
      const { metadata } = grailQuestCombat.start(makeEnemyStats()) as {
        metadata: Record<string, unknown>
      }
      expect(['player', 'enemy']).toContain(metadata['initiativeWinner'])
      expect(metadata['playerRoll']).not.toBe(metadata['enemyRoll'])
    } finally {
      vi.restoreAllMocks()
    }
  })
})
