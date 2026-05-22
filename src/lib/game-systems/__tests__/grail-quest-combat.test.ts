import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { grailQuestCombat } from '../grail-quest'

// ---- Helpers ----

function makeEnemyStats(overrides?: Partial<{ name: string; lifePoints: number; xp: number }>) {
  return { name: 'Goblin', lifePoints: 8, ...overrides }
}

function makeEnemyState(currentLifePoints: number) {
  return { currentLifePoints }
}

function makeCharacterStats(overrides?: Partial<{ lifePoints: number; experiencePoints: number }>) {
  return { lifePoints: 10, experiencePoints: 0, ...overrides }
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

describe('resolveRound — basic hit / miss mechanics', () => {
  it('roll ≥ 7 is a hit, damage = roll − 6', () => {
    // Force 2d6 to return [4, 3] = 7 → hit, damage 1
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((3 - 1) / 6)  // first die: 3
      .mockReturnValueOnce((4 - 1) / 6)  // second die: 4 → sum 7
      .mockReturnValueOnce(0)             // enemy dice (misses)
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith()
      expect(result.damageDealt).toBe(1) // 7 − 6 = 1
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll exactly 7 → 1 damage', () => {
    // [3+4]=7 → damage 1
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

  it('roll 12 (max) → 6 damage', () => {
    // [6+6]=12 → damage 6
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // always max face
    try {
      const result = resolveWith()
      // Player hits with 12, damage = 12 − 6 = 6
      expect(result.damageDealt).toBe(6)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll ≤ 6 → miss, 0 damage', () => {
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
  it('uses threshold 9 for risky attack', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      const detail = risky.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(9)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('uses threshold 7 for normal attack', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const detail = normal.detail as Record<string, unknown>
      expect(detail['playerThreshold']).toBe(7)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 10 risky attack → damage (10−6)×2 = 8', () => {
    // Force player dice [5+5]=10, enemy dice miss
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce((5 - 1) / 6)  // player die 1: 5
      .mockReturnValueOnce((5 - 1) / 6)  // player die 2: 5 → sum 10
      .mockReturnValueOnce(0)             // enemy miss
      .mockReturnValueOnce(0)
    try {
      const result = resolveWith({ chosenOptions: { riskyAttack: true } })
      expect(result.damageDealt).toBe(8) // (10−6)×2
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('roll 8 risky attack → miss (8 < 9)', () => {
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

  it('risky hit deals double damage compared to normal hit on same roll', () => {
    // Both roll 12 (max) — risky should be double
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const normal = resolveWith({ chosenOptions: { riskyAttack: false } })
      const risky = resolveWith({ chosenOptions: { riskyAttack: true } })
      expect(risky.damageDealt).toBe(normal.damageDealt * 2)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — enemy attack', () => {
  it('enemy roll ≥ 7 hits player, damage = enemyRoll − 6', () => {
    // Force enemy dice [6+6]=12 → damage 6; player dice miss
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

  it('enemy roll ≤ 6 → miss, 0 damage to player', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // all dice roll 1 → sum 2 < 7
    try {
      const result = resolveWith()
      expect(result.damageTaken).toBe(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveRound — win/lose conditions', () => {
  it('returns player_won when enemy currentLifePoints reaches 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // force high rolls
    try {
      const result = resolveWith({
        enemyState: makeEnemyState(1),
        characterStats: makeCharacterStats({ lifePoints: 20 }),
      })
      if (result.damageDealt >= 1) {
        expect(result.outcome).toBe('player_won')
      }
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
  it('applies playerThreshold override', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // dice always 1 → sum 2
    try {
      const normal = resolveWith()
      // 2 < 7 → miss
      expect(normal.damageDealt).toBe(0)

      // Override threshold to 2 → hit with roll 2, damage = 2 − 6 clamped to 0 … actually 0
      // Use threshold 1 so roll 2 > 1 and damage = max(0, 2-6) = 0 — test hit flag instead
      const overrideThreshold = resolveWith({
        combatModifiers: { playerThreshold: 2 }, // roll 2 ≥ 2 → hit, damage max(0, 2−6)=0
      })
      const detail = overrideThreshold.detail as Record<string, unknown>
      expect(detail['playerHit']).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('applies damageBonus on top of base damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // max dice → roll 12, base damage 6
    try {
      const normal = resolveWith()
      const withBonus = resolveWith({ combatModifiers: { damageBonus: 3 } })
      expect(withBonus.damageDealt).toBe(normal.damageDealt + 3)
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
