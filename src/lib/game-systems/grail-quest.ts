import type { GameSystem, CombatModule, CombatState, RoundOption, CombatOutcome, ConsumableDefinition } from './types'
import { gameSystemRegistry } from './registry'
import { rollDice } from '../dice'

export const XP_PER_LP = 20

/**
 * Returns the number of LP max bonuses earned for a given XP total.
 * Every 20 XP earns +1 permanent Life Points maximum.
 */
export function xpToLpBonuses(xp: number): number {
  return Math.floor(xp / XP_PER_LP)
}

/**
 * Returns XP progress toward the next LP threshold.
 * e.g. xp=8  → { progress: 8, threshold: 20 }
 * e.g. xp=25 → { progress: 5, threshold: 20 }
 */
export function xpThresholdProgress(xp: number): { progress: number; threshold: number } {
  return { progress: xp % XP_PER_LP, threshold: XP_PER_LP }
}

/**
 * After an XP change, check whether the character has crossed a new LP threshold
 * and, if so, permanently increase the LP maximum (initialStats lifePoints).
 *
 * Returns updated copies of both stats and initialStats. If no threshold was
 * crossed the returned objects are new references with the same values.
 */
export function applyXpThreshold(
  stats: Record<string, unknown>,
  initialStats: Record<string, unknown>,
): { stats: Record<string, unknown>; initialStats: Record<string, unknown> } {
  const xp = typeof stats['experiencePoints'] === 'number' ? stats['experiencePoints'] : 0
  const bonuses = xpToLpBonuses(xp)

  // The baseline LP max is stored in initialStats.  We track how many bonus
  // points have already been awarded via initialStats.lifePointsXpBonuses so
  // that we can detect new thresholds without caring about the starting value.
  const alreadyAwarded =
    typeof initialStats['lifePointsXpBonuses'] === 'number'
      ? initialStats['lifePointsXpBonuses']
      : 0

  const newBonuses = bonuses - alreadyAwarded
  if (newBonuses <= 0) {
    return { stats: { ...stats }, initialStats: { ...initialStats } }
  }

  const currentLpMax =
    typeof initialStats['lifePoints'] === 'number' ? initialStats['lifePoints'] : 0

  const newInitialStats = {
    ...initialStats,
    lifePoints: currentLpMax + newBonuses,
    lifePointsXpBonuses: bonuses,
  }

  return { stats: { ...stats }, initialStats: newInitialStats }
}

// ---- GQ combat type helpers ----

interface GqEnemyStats {
  name: string
  lifePoints: number
  xp?: number
}

interface GqEnemyState {
  currentLifePoints: number
}

interface GqMetadata {
  initiativeWinner: 'player' | 'enemy'
  playerRoll: number
  enemyRoll: number
  combatModifiers: Record<string, unknown>
  enemyXp: number
  playerThreshold: number
  enemyDamageBonus: number
  playerDamageBonus: number
  playerArmourReduction: number
  enemyArmourReduction: number
}

// ---- GQ combat module ----

export const grailQuestCombat: CombatModule = {
  enemyStatFields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'lifePoints', label: 'Life Points', type: 'number', required: true },
    { key: 'xp', label: 'XP reward', type: 'number', required: false },
    { key: 'enemyThreshold', label: 'Enemy hit threshold', type: 'number', required: false, default: 6 },
    { key: 'playerThreshold', label: 'Your hit threshold', type: 'number', required: false, default: 4 },
    { key: 'enemyDamageBonus', label: 'Enemy Damage Bonus', type: 'number', required: false, default: 0 },
    { key: 'playerDamageBonus', label: 'Player Damage Bonus', type: 'number', required: false, default: 5 },
    { key: 'playerArmourReduction', label: 'Player Armour (DR)', type: 'number', required: false, default: 0 },
    { key: 'enemyArmourReduction', label: 'Enemy Armour (DR)', type: 'number', required: false, default: 0 },
  ],
  primaryEnemyHealthStat: 'lifePoints',

  validateEnemyStats(input: unknown): string[] {
    const errors: string[] = []
    if (!input || typeof input !== 'object') {
      return ['Enemy stats must be an object']
    }
    const s = input as Record<string, unknown>
    if (!s.name || typeof s.name !== 'string' || !s.name.trim()) {
      errors.push('name is required')
    }
    if (typeof s.lifePoints !== 'number' || !Number.isInteger(s.lifePoints) || s.lifePoints < 1) {
      errors.push('lifePoints must be a positive integer')
    }
    if (s.xp !== undefined && (typeof s.xp !== 'number' || s.xp < 0)) {
      errors.push('xp must be a non-negative number')
    }
    return errors
  },

  start(input: unknown): { enemyState: unknown; metadata: unknown } {
    const s = input as GqEnemyStats
    const lifePoints = typeof s.lifePoints === 'number' ? s.lifePoints : 0

    // Roll initiative — 2d6 each, re-roll on ties
    let playerRoll: number
    let enemyRoll: number
    do {
      playerRoll = rollDice(2, 6).reduce((a, b) => a + b, 0)
      enemyRoll = rollDice(2, 6).reduce((a, b) => a + b, 0)
    } while (playerRoll === enemyRoll)

    const initiativeWinner: 'player' | 'enemy' = playerRoll > enemyRoll ? 'player' : 'enemy'

    const enemyState: GqEnemyState = { currentLifePoints: lifePoints }
    const metadata: GqMetadata = {
      initiativeWinner,
      playerRoll,
      enemyRoll,
      combatModifiers: {},
      enemyXp: typeof s.xp === 'number' ? s.xp : 0,
      playerThreshold: (input as any).playerThreshold ?? 4,
      enemyDamageBonus:
        typeof (input as any).enemyDamageBonus === 'number'
          ? Math.max(0, (input as any).enemyDamageBonus)
          : 0,
      playerDamageBonus:
        typeof (input as any).playerDamageBonus === 'number'
          ? Math.max(0, (input as any).playerDamageBonus)
          : 0,
      playerArmourReduction:
        typeof (input as any).playerArmourReduction === 'number'
          ? Math.max(0, (input as any).playerArmourReduction)
          : 0,
      enemyArmourReduction:
        typeof (input as any).enemyArmourReduction === 'number'
          ? Math.max(0, (input as any).enemyArmourReduction)
          : 0,
    }

    return { enemyState, metadata }
  },

  roundOptions(_state: CombatState): RoundOption[] {
    return [
      {
        key: 'riskyAttack',
        label: 'Risky Attack (nose bop)',
        description: 'Raises your hit threshold by 2 — double damage on hit.',
        type: 'boolean',
        default: false,
      },
    ]
  },

  resolveRound(args: {
    enemyStats: unknown
    enemyState: unknown
    metadata: unknown
    characterStats: unknown
    chosenOptions: Record<string, unknown>
    combatModifiers: Record<string, unknown>
  }): {
    enemyState: unknown
    characterDeltas: Record<string, number>
    detail: unknown
    damageDealt: number
    damageTaken: number
    outcome: CombatOutcome | null
  } {
    const enemyState = args.enemyState as GqEnemyState
    const characterStats = args.characterStats as Record<string, unknown>
    const mods = args.combatModifiers as Record<string, unknown>
    const metadataRecord = args.metadata as GqMetadata

    const currentLifePoints =
      typeof enemyState.currentLifePoints === 'number' ? enemyState.currentLifePoints : 0
    const playerCurrentLp =
      typeof characterStats['lifePoints'] === 'number' ? (characterStats['lifePoints'] as number) : 0

    // Combat modifiers (round-level overrides)
    const playerThresholdOverride =
      typeof mods['playerThreshold'] === 'number' ? (mods['playerThreshold'] as number) : null

    // Thresholds — metadata holds values set at combat start; mods can override
    const metadataPlayerThreshold =
      typeof metadataRecord?.playerThreshold === 'number' ? metadataRecord.playerThreshold : 4
    const enemyThresholdFromStats =
      typeof (args.enemyStats as any)?.enemyThreshold === 'number'
        ? (args.enemyStats as any).enemyThreshold as number
        : 6

    // Damage bonuses and armour reductions — sourced from combat metadata
    const playerDamageBonus =
      typeof metadataRecord?.playerDamageBonus === 'number'
        ? Math.max(0, metadataRecord.playerDamageBonus)
        : 0
    const enemyDamageBonus =
      typeof metadataRecord?.enemyDamageBonus === 'number'
        ? Math.max(0, metadataRecord.enemyDamageBonus)
        : 0
    const playerArmourReduction =
      typeof metadataRecord?.playerArmourReduction === 'number'
        ? Math.max(0, metadataRecord.playerArmourReduction)
        : 0
    const enemyArmourReduction =
      typeof metadataRecord?.enemyArmourReduction === 'number'
        ? Math.max(0, metadataRecord.enemyArmourReduction)
        : 0

    const riskyAttack = args.chosenOptions['riskyAttack'] === true

    // Initiative winner determines Phase 1 attacker.
    const initiativeWinner: 'player' | 'enemy' =
      metadataRecord?.initiativeWinner === 'enemy' ? 'enemy' : 'player'

    // --- Phase 1: initiative winner attacks ---
    const playerDice = rollDice(2, 6)
    const playerRoll = playerDice.reduce((s, r) => s + r, 0)
    const basePlayerThreshold = playerThresholdOverride ?? metadataPlayerThreshold
    const playerThreshold = riskyAttack ? basePlayerThreshold + 2 : basePlayerThreshold

    const enemyDice = rollDice(2, 6)
    const enemyRoll = enemyDice.reduce((s, r) => s + r, 0)
    const enemyThreshold = enemyThresholdFromStats

    // Compute raw damage for each side (used in phase logic)
    const playerHit = playerRoll > playerThreshold
    let rawDamageDealt = 0
    if (playerHit) {
      const baseDamage = Math.max(0, (playerRoll - playerThreshold) + playerDamageBonus - enemyArmourReduction)
      rawDamageDealt = riskyAttack ? baseDamage * 2 : baseDamage
    }

    const enemyHit = enemyRoll > enemyThreshold
    const rawDamageTaken = enemyHit
      ? Math.max(0, (enemyRoll - enemyThreshold) + enemyDamageBonus - playerArmourReduction)
      : 0

    // Phase 1 attacker strikes. Evaluate outcome after Phase 1.
    let phase1EnemyLp = currentLifePoints
    let phase1PlayerLp = playerCurrentLp
    if (initiativeWinner === 'player') {
      phase1EnemyLp = Math.max(0, currentLifePoints - rawDamageDealt)
    } else {
      phase1PlayerLp = playerCurrentLp - rawDamageTaken
    }

    // Evaluate combat outcome after Phase 1
    // Grail Quest: combat ends when enemy LP ≤ 5 (0 = killed, 1–5 = knocked out)
    let phase1Outcome: CombatOutcome | null = null
    if (phase1EnemyLp <= 5) {
      phase1Outcome = phase1EnemyLp <= 0 ? 'player_won' : 'enemy_knocked_out'
    } else if (phase1PlayerLp <= 0) {
      phase1Outcome = 'player_lost'
    }

    let damageDealt: number
    let damageTaken: number
    let newCurrentLifePoints: number
    let outcome: CombatOutcome | null
    let phaseTwoSkipped: boolean

    if (phase1Outcome !== null) {
      // Combat ends after Phase 1 — Phase 2 is skipped
      phaseTwoSkipped = true
      outcome = phase1Outcome
      if (initiativeWinner === 'player') {
        damageDealt = rawDamageDealt
        damageTaken = 0
        newCurrentLifePoints = phase1EnemyLp
      } else {
        damageDealt = 0
        damageTaken = rawDamageTaken
        newCurrentLifePoints = currentLifePoints
      }
    } else {
      // --- Phase 2: initiative loser attacks ---
      phaseTwoSkipped = false
      damageDealt = rawDamageDealt
      damageTaken = rawDamageTaken
      newCurrentLifePoints = Math.max(0, currentLifePoints - damageDealt)

      // Re-evaluate outcome with both phases applied
      outcome = null
      if (newCurrentLifePoints <= 5) {
        outcome = newCurrentLifePoints <= 0 ? 'player_won' : 'enemy_knocked_out'
      } else if (playerCurrentLp - damageTaken <= 0) {
        outcome = 'player_lost'
      }
    }

    const newEnemyState: GqEnemyState = { currentLifePoints: newCurrentLifePoints }

    // Build detail narrative
    const detail = {
      playerDice,
      playerRoll,
      playerThreshold,
      playerHit,
      damageDealt,
      enemyDice,
      enemyRoll,
      enemyThreshold,
      enemyHit,
      damageTaken,
      phaseTwoSkipped,
      narrative: buildNarrative({
        playerDice,
        playerRoll,
        playerThreshold,
        playerHit,
        damageDealt,
        riskyAttack,
        enemyDice,
        enemyRoll,
        enemyThreshold,
        enemyHit,
        damageTaken,
        phaseTwoSkipped,
        initiativeWinner,
      }),
    }

    return {
      enemyState: newEnemyState,
      characterDeltas: { lifePoints: -damageTaken },
      detail,
      damageDealt,
      damageTaken,
      outcome,
    }
  },
}

function buildNarrative(info: {
  playerDice: number[]
  playerRoll: number
  playerThreshold: number
  playerHit: boolean
  damageDealt: number
  riskyAttack: boolean
  enemyDice: number[]
  enemyRoll: number
  enemyThreshold: number
  enemyHit: boolean
  damageTaken: number
  phaseTwoSkipped: boolean
  initiativeWinner: 'player' | 'enemy'
}): string {
  // First-strike kill: Phase 2 was skipped because Phase 1 ended combat
  if (info.phaseTwoSkipped) {
    if (info.initiativeWinner === 'player') {
      return `You strike first, dealing ${info.damageDealt} damage. The enemy falls before striking back.`
    } else {
      return `The enemy strikes first, dealing ${info.damageTaken} damage. You fall before striking back.`
    }
  }

  // Normal round — both phases ran
  const diceStr = (dice: number[]) => `[${dice.join('+')}]=${dice.reduce((s, r) => s + r, 0)}`
  const playerPart = info.playerHit
    ? `Your attack ${diceStr(info.playerDice)} (>${info.playerThreshold}, hit${info.riskyAttack ? ', risky' : ''}), dealt ${info.damageDealt} damage.`
    : `Your attack ${diceStr(info.playerDice)} (>${info.playerThreshold} needed, miss).`
  const enemyPart = info.enemyHit
    ? `Enemy ${diceStr(info.enemyDice)} (>${info.enemyThreshold}, hit), dealt ${info.damageTaken} damage.`
    : `Enemy ${diceStr(info.enemyDice)} (>${info.enemyThreshold} needed, miss).`
  return `${playerPart} ${enemyPart}`
}

const grailQuestConsumables: ConsumableDefinition[] = [
  {
    name: 'Healing Potion',
    itemType: 'potion',
    initialCount: 3,
    doseCount: 6,
    healDice: '1d6',
    description: 'restores 1d6 LP',
  },
  {
    name: 'Salve',
    itemType: 'salve',
    initialCount: 1,
    doseCount: 5,
    healAmount: 3,
    description: 'restores 3 LP',
  },
]

export const grailQuest: GameSystem = {
  id: 'grail-quest',
  name: 'Grail Quest',
  stats: [
    {
      key: 'lifePoints',
      label: 'Life Points',
      min: 0,
      max: 48,
      initialDice: { count: 2, sides: 6, modifier: 0, multiplier: 4, bestOf: 3 },
    },
    {
      key: 'experiencePoints',
      label: 'Experience Points',
      min: 0,
    },
  ],
  primaryHealthStat: 'lifePoints',
  defaultDice: { count: 2, sides: 6, modifier: 0 },
  combat: grailQuestCombat,
  spells: [
    { id: 'lightning-bolt', name: 'Lightning Bolt', maxUses: 10, hitCondition: 'Auto-hit', damage: 10 },
    { id: 'fireball', name: 'Fireball', maxUses: 2, hitCondition: 'Roll 6+ on 2d6', damage: 75 },
  ],
  consumables: grailQuestConsumables,
}

gameSystemRegistry.register(grailQuest)
