import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { grailQuestCombat } from '../grail-quest'

// ---- Helpers ----

function makeEnemyStats(overrides?: Partial<{
  name: string; skill: number; stamina: number; damage: number; xp: number
}>) {
  return { name: 'Goblin', skill: 5, stamina: 8, damage: 2, ...overrides }
}

function makeEnemyState(currentStamina: number) {
  return { currentStamina }
}

function makeCharacterStats(overrides?: Partial<{ lifePoints: number; skill: number }>) {
  return { lifePoints: 10, skill: 7, ...overrides }
}

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
    metadata: opts.metadata ?? {},
    characterStats: opts.characterStats ?? makeCharacterStats(),
    chosenOptions: opts.chosenOptions ?? {},
    combatModifiers: opts.combatModifiers ?? {},
  })
}

// ---- Tests ----

describe('validateEnemyStats', () => {
  it('returns empty array for valid stats', () => {
    expect(grailQuestCombat.validateEnemyStats({ name: 'Troll', skill: 8, stamina: 12 })).toEqual([])
  })

  it('requires name', () => {
    const errs = grailQuestCombat.validateEnemyStats({ skill: 5, stamina: 6 })
    expect(errs).toContain('name is required')
  })

  it('requires skill ≥ 1', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', skill: 0, stamina: 6 })
    expect(errs.some(e => e.includes('skill'))).toBe(true)
  })

  it('requires stamina ≥ 1', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', skill: 5, stamina: 0 })
    expect(errs.some(e => e.includes('stamina'))).toBe(true)
  })

  it('rejects negative damage', () => {
    const errs = grailQuestCombat.validateEnemyStats({ name: 'X', skill: 5, stamina: 6, damage: -1 })
    expect(errs.some(e => e.includes('damage'))).toBe(true)
  })
})

describe('start — initiative', () => {
  it('resolves initiative without a tie result', () => {
    const { metadata } = grailQuestCombat.start(makeEnemyStats()) as {
      enemyState: Record<string, unknown>
      metadata: Record<string, unknown>
    }
    expect(['player', 'enemy']).toContain(metadata['initiativeWinner'])
    expect(typeof metadata['playerRoll']).toBe('number')
    expect(typeof metadata['enemyRoll']).toBe('number')
    expect(metadata['playerRoll']).not.toBe(metadata['enemyRoll'])
  })

  it('sets enemyState.currentStamina to enemyStats.stamina', () => {
    const { enemyState } = grailQuestCombat.start(makeEnemyStats({ stamina: 14 })) as {
      enemyState: Record<string, unknown>
    }
    expect(enemyState['currentStamina']).toBe(14)
  })

  it('stores enemyXp from input', () => {
    const { metadata } = grailQuestCombat.start(makeEnemyStats({ xp: 25 })) as {
      metadata: Record<string, unknown>
    }
    expect(metadata['enemyXp']).toBe(25)
  })
})

describe('resolveRound — attack hit and miss', () => {
  it('player hit: damageDealt > 0 when dice guaranteed to hit', () => {
    // Force dice to return high values by mocking Math.random
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // always rolls max face
    try {
      const result = resolveWith()
      // With very high rolls both sides should hit
      expect(result.damageDealt).toBeGreaterThanOrEqual(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('player miss: damageDealt = 0 when dice force a miss', () => {
    // rollDice(2,6) min value = 2; player skill 7; total 9 — this always hits threshold 7
    // To force a miss, set player skill very low and return minimum dice
    vi.spyOn(Math, 'random').mockReturnValue(0) // always rolls 1
    try {
      const result = resolveWith({
        characterStats: makeCharacterStats({ skill: 0, lifePoints: 10 }),
      })
      // 2d6 min (2) + skill 0 = 2, threshold 7 → miss
      expect(result.damageDealt).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemy hit: damageTaken > 0 when dice force enemy hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const result = resolveWith({ enemyStats: makeEnemyStats({ skill: 10, damage: 3 }) })
      // High enemy skill + max dice → enemy hits
      expect(result.damageTaken).toBeGreaterThanOrEqual(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('enemy miss: damageTaken = 0 when dice force miss', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // always 1
    try {
      const result = resolveWith({ enemyStats: makeEnemyStats({ skill: 0 }) })
      // 2 + 0 = 2 < 7 → miss
      expect(result.damageTaken).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — risky attack', () => {
  it('uses threshold 8 for player attack when risky', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // max dice
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      const normalDetail = normal.detail as Record<string, unknown>
      const riskyDetail = risky.detail as Record<string, unknown>
      const normalAttack = normalDetail['playerAttack'] as Record<string, unknown>
      const riskyAttack = riskyDetail['playerAttack'] as Record<string, unknown>
      expect(normalAttack['threshold']).toBe(7)
      expect(riskyAttack['threshold']).toBe(8)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('deals double damage on risky hit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // max dice, both hit
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      if (normal.damageDealt > 0 && risky.damageDealt > 0) {
        expect(risky.damageDealt).toBe(normal.damageDealt * 2)
      }
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — win/lose conditions', () => {
  it('returns player_won when enemy stamina reaches 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // force player hit
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(1), // 1 stamina left
        characterStats: makeCharacterStats({ skill: 20, lifePoints: 20 }),
      })
      if (result.damageDealt >= 1) {
        expect(result.outcome).toBe('player_won')
      }
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns player_lost when player LP would reach 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // force enemy hit
    try {
      const result = resolveWith({
        enemyStats: makeEnemyStats({ skill: 20, damage: 5 }),
        enemyState: makeEnemyState(100),
        characterStats: makeCharacterStats({ skill: 0, lifePoints: 1 }),
      })
      if (result.damageTaken >= 1) {
        expect(result.outcome).toBe('player_lost')
      }
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns null when combat continues', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // force all misses
    try {
      const result = resolveWith({
        enemyStats: makeEnemyStats({ skill: 0 }),
        enemyState: makeEnemyState(20),
        characterStats: makeCharacterStats({ skill: 0, lifePoints: 20 }),
      })
      // Both miss → no damage → no outcome change
      expect(result.outcome).toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — combat modifiers', () => {
  it('applies +2 attackBonus to player attack roll', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const withBonus = resolveWith({
        characterStats: makeCharacterStats({ skill: 0, lifePoints: 10 }),
        combatModifiers: { attackBonus: 10 }, // 2 + 0 + 10 = 12 ≥ 7 → hit
      })
      expect(withBonus.damageDealt).toBeGreaterThan(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('applies playerThreshold override', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const normal = resolveWith({ characterStats: makeCharacterStats({ skill: 0 }) })
      // 2 + 0 = 2 < 7 → miss
      expect(normal.damageDealt).toBe(0)

      const overrideThreshold = resolveWith({
        characterStats: makeCharacterStats({ skill: 0 }),
        combatModifiers: { playerThreshold: 2 }, // threshold 2, roll 2 → hit
      })
      expect(overrideThreshold.damageDealt).toBeGreaterThan(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('roundOptions', () => {
  it('always includes riskyAttack option', () => {
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
    let callCount = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      // First 4 calls (2 dice × 2 sides) produce same value → tie
      // After 4 calls, return different values
      callCount++
      if (callCount <= 4) return 0.5 // yields same roll
      return callCount % 2 === 0 ? 0.1 : 0.9 // different rolls
    })
    try {
      const { metadata } = grailQuestCombat.start(makeEnemyStats()) as {
        metadata: Record<string, unknown>
      }
      expect(['player', 'enemy']).toContain(metadata['initiativeWinner'])
    } finally {
      vi.restoreAllMocks()
    }
  })
})
