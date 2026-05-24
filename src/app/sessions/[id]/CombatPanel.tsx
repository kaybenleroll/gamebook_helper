'use client'

import { useState } from 'react'
import type { CombatModule, RoundOption } from '../../../lib/game-systems/types'

// ---- Types matching the API response shapes ----

interface CombatRound {
  id: number
  roundNumber: number
  detail: Record<string, unknown>
  damageDealt: number
  damageTaken: number
  createdAt: string
}

interface CombatData {
  id: number
  sessionId: number
  enemyName: string
  enemyStats: Record<string, unknown>
  enemyState: Record<string, unknown>
  metadata: Record<string, unknown>
  outcome: string
  startedAt: string
  endedAt: string | null
  availableRoundOptions?: RoundOption[]
  rounds: CombatRound[]
}

// ---- Luck result type ----

interface LuckResult {
  type: 'attack' | 'defence'
  roll: number
  success: boolean
  delta: number
  message: string
}

interface Props {
  sessionId: number
  initialCombat: CombatData | null
  enemyStatFields: CombatModule['enemyStatFields']
  characterStats: Record<string, unknown>
  initialStats: Record<string, unknown>
  isGameOver: boolean
  onStatsChange: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
  primaryHealthStat: string
  primaryEnemyHealthStat: string
  onCombatEnd?: () => void
  hasTestLuck?: boolean
}

interface EnemyFormState {
  [key: string]: string
}

// ---- Sub-components ----

function HpBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-mono">
          {current} / {max}
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatDice(dice: number[]): string {
  return `[${dice.join('+')}]`
}

function RollBreakdown({ detail }: { detail: Record<string, unknown> }) {
  const playerDice = Array.isArray(detail['playerDice']) ? (detail['playerDice'] as number[]) : null
  const playerRoll = typeof detail['playerRoll'] === 'number' ? (detail['playerRoll'] as number) : null
  const playerThreshold = typeof detail['playerThreshold'] === 'number' ? (detail['playerThreshold'] as number) : null
  const playerAS = typeof detail['playerAS'] === 'number' ? (detail['playerAS'] as number) : null

  const enemyDice = Array.isArray(detail['enemyDice']) ? (detail['enemyDice'] as number[]) : null
  const enemyRoll = typeof detail['enemyRoll'] === 'number' ? (detail['enemyRoll'] as number) : null
  const enemyThreshold = typeof detail['enemyThreshold'] === 'number' ? (detail['enemyThreshold'] as number) : null
  const enemyAS = typeof detail['enemyAS'] === 'number' ? (detail['enemyAS'] as number) : null

  // No breakdown available for this round
  if (!playerDice && playerRoll === null) return null

  const playerExtra = playerAS !== null ? ` (AS: ${playerAS})` : playerThreshold !== null ? ` (threshold: ${playerThreshold})` : ''
  const enemyExtra = enemyAS !== null ? ` (AS: ${enemyAS})` : enemyThreshold !== null ? ` (threshold: ${enemyThreshold})` : ''

  const playerStr = playerDice
    ? `${formatDice(playerDice)} = ${playerRoll}${playerExtra}`
    : playerRoll !== null
      ? `roll: ${playerRoll}${playerExtra}`
      : null

  const enemyStr = enemyDice
    ? `${formatDice(enemyDice)} = ${enemyRoll}${enemyExtra}`
    : enemyRoll !== null
      ? `roll: ${enemyRoll}${enemyExtra}`
      : null

  return (
    <div className="mt-1 text-xs text-gray-400 font-mono flex gap-4 flex-wrap">
      {playerStr && <span>You: {playerStr}</span>}
      {enemyStr && <span>Enemy: {enemyStr}</span>}
    </div>
  )
}

function LuckResultsBreakdown({ luckResults }: { luckResults: unknown }) {
  if (!Array.isArray(luckResults) || luckResults.length === 0) return null
  return (
    <div className="mt-1 text-xs text-amber-700 flex flex-col gap-0.5">
      {(luckResults as Array<Record<string, unknown>>).map((r, i) => {
        const type = typeof r['type'] === 'string' ? r['type'] : '?'
        const roll = typeof r['roll'] === 'number' ? r['roll'] : '?'
        const success = r['success'] === true
        const delta = typeof r['delta'] === 'number' ? r['delta'] : 0
        const label = type === 'attack' ? 'Attack' : 'Defence'
        const outcome = success ? 'Lucky' : 'Unlucky'
        const deltaStr = (delta as number) > 0 ? `+${delta}` : String(delta)
        return (
          <span key={i}>
            Luck ({label}): rolled {roll} — {outcome} ({deltaStr} dmg {type === 'attack' ? 'dealt' : 'taken'})
          </span>
        )
      })}
    </div>
  )
}

function RoundLogEntry({ round }: { round: CombatRound }) {
  const detail = round.detail as Record<string, unknown>
  const narrative =
    typeof detail['narrative'] === 'string'
      ? detail['narrative']
      : `Round ${round.roundNumber} — dealt ${round.damageDealt}, taken ${round.damageTaken}`
  return (
    <div className="text-sm border-b py-2 last:border-0">
      <div>
        <span className="font-semibold">Round {round.roundNumber}:</span>{' '}
        <span className="text-gray-700">{narrative}</span>
      </div>
      <RollBreakdown detail={detail} />
      <LuckResultsBreakdown luckResults={detail['luckResults']} />
    </div>
  )
}

// ---- Main component ----

export default function CombatPanel({
  sessionId,
  initialCombat,
  enemyStatFields,
  characterStats,
  initialStats,
  isGameOver,
  onStatsChange,
  primaryHealthStat,
  primaryEnemyHealthStat,
  onCombatEnd,
  hasTestLuck,
}: Props) {
  const [combat, setCombat] = useState<CombatData | null>(initialCombat)
  const [enemyForm, setEnemyForm] = useState<EnemyFormState>(() => {
    const initial: EnemyFormState = {}
    const weaponValue = (characterStats.weapon as { value?: number } | undefined)?.value
    const armourValue = (characterStats.armour as { value?: number } | undefined)?.value
    if (weaponValue !== undefined) initial['playerDamageBonus'] = String(weaponValue)
    if (armourValue !== undefined) initial['playerArmourReduction'] = String(armourValue)
    return initial
  })
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  // Round form state
  const [roundOptions, setRoundOptions] = useState<Record<string, unknown>>({})
  const [combatModifiers, setCombatModifiers] = useState<Record<string, unknown>>({})
  const [showModifiers, setShowModifiers] = useState(false)
  const [isResolving, setIsResolving] = useState(false)

  // Post-roll override state
  const [pendingResult, setPendingResult] = useState<{
    damageDealt: number
    damageTaken: number
    phaseTwoSkipped: boolean
  } | null>(null)
  const [overrideDamageDealt, setOverrideDamageDealt] = useState('')
  const [overrideDamageTaken, setOverrideDamageTaken] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)

  // Luck state — reset on each round commit
  const [luckAttackUsed, setLuckAttackUsed] = useState(false)
  const [luckDefenceUsed, setLuckDefenceUsed] = useState(false)
  const [localLuckSpent, setLocalLuckSpent] = useState(0)
  const [luckResults, setLuckResults] = useState<LuckResult[]>([])

  // XP modal state
  const [showXpModal, setShowXpModal] = useState(false)
  const [xpInput, setXpInput] = useState('')
  const [isSavingXp, setIsSavingXp] = useState(false)

  const [roundError, setRoundError] = useState<string | null>(null)

  // Effective luck accounts for luck spent this round before onStatsChange propagates
  const currentLuck =
    typeof (characterStats as Record<string, unknown>)['luck'] === 'number'
      ? ((characterStats as Record<string, unknown>)['luck'] as number)
      : 0
  const effectiveLuck = currentLuck - localLuckSpent

  // ---- Start fight ----

  async function startFight() {
    setIsStarting(true)
    setStartError(null)
    try {
      // Convert form values to correct types
      const payload: Record<string, unknown> = {}
      // Include enemy name (sent as 'name' per API convention)
      const enemyNameValue = (enemyForm['enemyName'] ?? '').trim()
      if (enemyNameValue) payload['name'] = enemyNameValue
      for (const field of enemyStatFields) {
        const raw =
          enemyForm[field.key] !== undefined
            ? enemyForm[field.key]
            : field.default !== undefined
              ? String(field.default)
              : ''
        if (field.type === 'number') {
          const n = parseFloat(raw)
          if (!isNaN(n)) payload[field.key] = n
        } else if (field.type === 'radio') {
          if (raw.trim()) payload[field.key] = raw.trim()
        } else {
          if (raw.trim()) payload[field.key] = raw.trim()
        }
      }

      const res = await fetch(`/api/sessions/${sessionId}/combats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = (await res.json()) as CombatData
        setCombat(data)
        const resetForm: EnemyFormState = {}
        const weaponValue = (characterStats.weapon as { value?: number } | undefined)?.value
        const armourValue = (characterStats.armour as { value?: number } | undefined)?.value
        if (weaponValue !== undefined) resetForm['playerDamageBonus'] = String(weaponValue)
        if (armourValue !== undefined) resetForm['playerArmourReduction'] = String(armourValue)
        setEnemyForm(resetForm)
        setRoundOptions({})
        setCombatModifiers({})
        setPendingResult(null)
      } else {
        const err = (await res.json()) as { error?: string; details?: string[] }
        setStartError(err.details?.join(', ') ?? err.error ?? 'Failed to start combat')
      }
    } finally {
      setIsStarting(false)
    }
  }

  // ---- Resolve round ----

  async function resolveRound() {
    if (!combat) return
    setIsResolving(true)
    setRoundError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosenOptions: roundOptions,
          combatModifiers,
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          round: CombatRound
          combat: { id: number; outcome: string; enemyState: Record<string, unknown>; endedAt: string | null; availableRoundOptions?: RoundOption[] }
          characterStats: Record<string, unknown>
          characterInitialStats: Record<string, unknown>
          xpPrompt?: boolean
        }
        // Update combat state
        setCombat((prev) => {
          if (!prev) return null
          return {
            ...prev,
            enemyState: data.combat.enemyState,
            outcome: data.combat.outcome,
            endedAt: data.combat.endedAt,
            availableRoundOptions: data.combat.availableRoundOptions,
            rounds: [...prev.rounds, data.round],
          }
        })
        onStatsChange(data.characterStats, data.characterInitialStats)
        // Show post-roll override
        setPendingResult({
          damageDealt: data.round.damageDealt,
          damageTaken: data.round.damageTaken,
          phaseTwoSkipped: data.round.detail['phaseTwoSkipped'] === true,
        })
        setOverrideDamageDealt(String(data.round.damageDealt))
        setOverrideDamageTaken(String(data.round.damageTaken))
        // Reset round options and luck state for the new round
        setRoundOptions({})
        setLuckAttackUsed(false)
        setLuckDefenceUsed(false)
        setLocalLuckSpent(0)
        setLuckResults([])
        if (data.xpPrompt) {
          setShowXpModal(true)
        }
      } else {
        const err = (await res.json()) as { error?: string }
        setRoundError(err.error ?? 'Failed to resolve round')
      }
    } finally {
      setIsResolving(false)
    }
  }

  // ---- Test luck ----

  async function handleLuckTest(type: 'attack' | 'defence') {
    if (!pendingResult) return

    // Optimistically track luck spent before API response propagates
    setLocalLuckSpent(prev => prev + 1)

    const res = await fetch(`/api/sessions/${sessionId}/actions/test-luck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      // Roll back optimistic decrement on error
      setLocalLuckSpent(prev => prev - 1)
      return
    }

    const data = (await res.json()) as {
      roll: number
      success: boolean
      newLuck: number
      message: string
      stats: Record<string, unknown>
      initialStats: Record<string, unknown>
    }

    // Compute damage delta
    let delta = 0
    if (type === 'attack') {
      delta = data.success ? 2 : -1
      const parsed = parseInt(overrideDamageDealt, 10)
      const base = isNaN(parsed) ? (pendingResult.damageDealt) : parsed
      setOverrideDamageDealt(String(Math.max(0, base + delta)))
      setLuckAttackUsed(true)
    } else {
      delta = data.success ? -1 : 1
      const parsed = parseInt(overrideDamageTaken, 10)
      const base = isNaN(parsed) ? (pendingResult.damageTaken) : parsed
      setOverrideDamageTaken(String(Math.max(0, base + delta)))
      setLuckDefenceUsed(true)
    }

    const luckResult: LuckResult = {
      type,
      roll: data.roll,
      success: data.success,
      delta,
      message: data.message,
    }
    setLuckResults(prev => [...prev, luckResult])

    onStatsChange(data.stats, data.initialStats)
  }

  // ---- Commit overrides ----

  async function commitOverrides() {
    if (!combat || !pendingResult) return
    const lastRound = combat.rounds[combat.rounds.length - 1]
    if (!lastRound) return

    // Only send overrides if they differ from provisionals
    const damageDealtOverride = parseInt(overrideDamageDealt, 10)
    const damageTakenOverride = parseInt(overrideDamageTaken, 10)

    const hasOverride =
      (!isNaN(damageDealtOverride) && damageDealtOverride !== pendingResult.damageDealt) ||
      (!isNaN(damageTakenOverride) && damageTakenOverride !== pendingResult.damageTaken)

    const hasLuckResults = luckResults.length > 0

    if (!hasOverride && !hasLuckResults) {
      setPendingResult(null)
      setLuckAttackUsed(false)
      setLuckDefenceUsed(false)
      setLocalLuckSpent(0)
      setLuckResults([])
      return
    }

    setIsCommitting(true)
    setRoundError(null)
    try {
      const overridesPayload: { damageDealt?: number; damageTaken?: number } = {}
      if (!isNaN(damageDealtOverride) && damageDealtOverride !== pendingResult.damageDealt) {
        overridesPayload.damageDealt = damageDealtOverride
      }
      if (!isNaN(damageTakenOverride) && damageTakenOverride !== pendingResult.damageTaken) {
        overridesPayload.damageTaken = damageTakenOverride
      }

      const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosenOptions: roundOptions,
          combatModifiers,
          overrides: Object.keys(overridesPayload).length > 0 ? overridesPayload : undefined,
          ...(luckResults.length > 0 ? { luckResults } : {}),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          round: CombatRound
          combat: { id: number; outcome: string; enemyState: Record<string, unknown>; endedAt: string | null; availableRoundOptions?: RoundOption[] }
          characterStats: Record<string, unknown>
          characterInitialStats: Record<string, unknown>
          xpPrompt?: boolean
        }
        setCombat((prev) => {
          if (!prev) return null
          return {
            ...prev,
            enemyState: data.combat.enemyState,
            outcome: data.combat.outcome,
            endedAt: data.combat.endedAt,
            availableRoundOptions: data.combat.availableRoundOptions,
            rounds: [...prev.rounds, data.round],
          }
        })
        onStatsChange(data.characterStats, data.characterInitialStats)
        setPendingResult(null)
        setLuckAttackUsed(false)
        setLuckDefenceUsed(false)
        setLocalLuckSpent(0)
        setLuckResults([])
        if (data.xpPrompt) setShowXpModal(true)
      } else {
        const err = (await res.json()) as { error?: string }
        setRoundError(err.error ?? 'Failed to commit overrides')
      }
    } finally {
      setIsCommitting(false)
    }
  }

  // ---- Flee ----

  async function flee() {
    if (!combat) return
    const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'player_fled', endedAt: new Date().toISOString() }),
    })
    if (res.ok) {
      const data = (await res.json()) as CombatData
      setCombat(data)
    }
  }

  // ---- Award XP ----

  async function awardXp() {
    const xp = parseInt(xpInput, 10)
    if (isNaN(xp) || xp < 0) return
    setIsSavingXp(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/character`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stat: 'experiencePoints', delta: xp }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          stats: Record<string, unknown>
          initialStats: Record<string, unknown>
        }
        onStatsChange(data.stats, data.initialStats)
      }
    } finally {
      setIsSavingXp(false)
      setShowXpModal(false)
      setXpInput('')
      onCombatEnd?.()
    }
  }

  // ---- Helpers ----

  const activeCombatOptions: RoundOption[] = combat?.outcome === 'in_progress'
    ? (combat.availableRoundOptions ?? [])
    : []

  const enemyHpKey = primaryEnemyHealthStat
  // Read current enemy HP using the system-aware field name.
  // Some systems (Grail Quest) store current HP under a 'current'-prefixed key
  // (e.g. currentLifePoints); others (Fighting Fantasy) store it directly under
  // the primary health stat key (e.g. stamina). Try the direct key first.
  const enemyCurrentHpKey = 'current' + primaryEnemyHealthStat.charAt(0).toUpperCase() + primaryEnemyHealthStat.slice(1)
  const enemyStateRecord = (combat?.enemyState as Record<string, unknown> | undefined) ?? {}
  const enemyCurrentHp =
    typeof enemyStateRecord[primaryEnemyHealthStat] === 'number'
      ? (enemyStateRecord[primaryEnemyHealthStat] as number)
      : typeof enemyStateRecord[enemyCurrentHpKey] === 'number'
        ? (enemyStateRecord[enemyCurrentHpKey] as number)
        : 0
  const enemyMaxHp =
    typeof (combat?.enemyStats as Record<string, unknown> | undefined)?.[enemyHpKey] === 'number'
      ? ((combat!.enemyStats as Record<string, unknown>)[enemyHpKey] as number)
      : 0
  const playerCurrentHp =
    typeof characterStats[primaryHealthStat] === 'number' ? (characterStats[primaryHealthStat] as number) : 0
  const playerMaxHp =
    typeof initialStats[primaryHealthStat] === 'number' ? (initialStats[primaryHealthStat] as number) : 0
  const totalDamageDealt = combat ? combat.rounds.reduce((sum, r) => sum + r.damageDealt, 0) : 0
  const totalDamageTaken = combat ? combat.rounds.reduce((sum, r) => sum + r.damageTaken, 0) : 0

  // ---- Render states ----

  if (isGameOver && !combat) {
    return (
      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-3">Combat</h2>
        <p className="text-gray-500 text-sm">Adventure ended — no new combats.</p>
      </section>
    )
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Combat</h2>

      {/* XP modal */}
      {showXpModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-lg mb-3">Award XP from this fight?</h3>
            <input
              type="number"
              min="0"
              value={xpInput}
              onChange={(e) => setXpInput(e.target.value)}
              placeholder="XP amount"
              className="border rounded px-3 py-2 w-full mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowXpModal(false); setXpInput(''); onCombatEnd?.() }}
                className="px-4 py-2 border rounded"
              >
                Skip
              </button>
              <button
                onClick={awardXp}
                disabled={isSavingXp || xpInput === '' || isNaN(parseInt(xpInput, 10))}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
              >
                {isSavingXp ? 'Awarding…' : 'Award'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No active combat — start form */}
      {!combat && !isGameOver && (
        <div className="border rounded p-4 max-w-md">
          <h3 className="font-semibold mb-3">New fight</h3>
          <div className="flex items-center gap-2 mb-2">
            <label className="w-28 text-sm shrink-0">
              Enemy name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="border rounded px-2 py-1 text-sm flex-1"
              value={enemyForm['enemyName'] ?? ''}
              onChange={e => setEnemyForm(prev => ({ ...prev, enemyName: e.target.value }))}
            />
          </div>
          {enemyStatFields.map((field) => (
            <div key={field.key} className="flex items-center gap-2 mb-2">
              <label className="w-28 text-sm shrink-0">
                {field.label}
                {'required' in field && field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === 'radio' ? (
                <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label={field.label}>
                  {field.options.map((opt) => {
                    const currentVal =
                      enemyForm[field.key] !== undefined
                        ? enemyForm[field.key]
                        : field.default ?? ''
                    return (
                      <label key={opt.value} className="flex items-center gap-1 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={field.key}
                          value={opt.value}
                          checked={currentVal === opt.value}
                          onChange={() =>
                            setEnemyForm((prev) => ({ ...prev, [field.key]: opt.value }))
                          }
                        />
                        {opt.label}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={
                    enemyForm[field.key] !== undefined
                      ? enemyForm[field.key]
                      : field.default !== undefined
                        ? String(field.default)
                        : ''
                  }
                  min={field.type === 'number' && (field.key === 'enemyDamageBonus' || field.key === 'playerDamageBonus' || field.key === 'playerArmourReduction') ? 0 : undefined}
                  onChange={(e) =>
                    setEnemyForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="border rounded px-2 py-1 text-sm flex-1"
                  aria-label={field.label}
                />
              )}
            </div>
          ))}
          {startError && <p className="text-red-600 text-sm mb-2">{startError}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={startFight}
              disabled={isStarting || !(enemyForm['enemyName'] ?? '').trim()}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-40"
            >
              {isStarting ? 'Starting…' : 'Start fight'}
            </button>
          </div>
        </div>
      )}

      {/* Active combat */}
      {combat && combat.outcome === 'in_progress' && (
        <div className="border rounded p-4 max-w-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Fighting: {combat.enemyName}</h3>
            {combat.metadata['initiativeWinner'] === 'player' && (
              <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                You have initiative
              </span>
            )}
            {combat.metadata['initiativeWinner'] === 'enemy' && (
              <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                Enemy has initiative
              </span>
            )}
          </div>

          {/* HP bars */}
          <div className="mb-4">
            <HpBar current={enemyCurrentHp} max={enemyMaxHp} label={`${combat.enemyName} ${enemyStatFields.find(f => f.key === primaryEnemyHealthStat)?.label ?? primaryEnemyHealthStat}`} />
            <HpBar current={playerCurrentHp} max={playerMaxHp} label="Your Life Points" />
          </div>
          {combat.rounds.length > 0 && (
            <div className="mb-4 text-sm text-gray-600 flex gap-6">
              <span>Damage dealt: <strong>{totalDamageDealt}</strong></span>
              <span>Damage taken: <strong>{totalDamageTaken}</strong></span>
            </div>
          )}

          {/* Round form — only if no pending result to commit */}
          {!pendingResult && (
            <div className="mb-4">
              <h4 className="font-semibold mb-2">Round options</h4>

              {activeCombatOptions.map((opt) => (
                <div key={opt.key} className="flex items-center gap-3 mb-2">
                  {opt.type === 'boolean' && (
                    <>
                      <input
                        type="checkbox"
                        id={`opt-${opt.key}`}
                        checked={roundOptions[opt.key] === true}
                        onChange={(e) =>
                          setRoundOptions((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                        }
                      />
                      <label htmlFor={`opt-${opt.key}`} className="text-sm" title={opt.description}>
                        {opt.label}
                      </label>
                    </>
                  )}
                  {opt.type === 'number' && (
                    <>
                      <label htmlFor={`opt-${opt.key}`} className="text-sm w-28" title={opt.description}>
                        {opt.label}
                      </label>
                      <input
                        id={`opt-${opt.key}`}
                        type="number"
                        value={
                          typeof roundOptions[opt.key] === 'number'
                            ? String(roundOptions[opt.key])
                            : String(opt.default)
                        }
                        onChange={(e) =>
                          setRoundOptions((prev) => ({
                            ...prev,
                            [opt.key]: parseFloat(e.target.value),
                          }))
                        }
                        className="border rounded px-2 py-1 text-sm w-20"
                      />
                    </>
                  )}
                </div>
              ))}

              {/* Combat modifiers (expandable) */}
              <button
                onClick={() => setShowModifiers((v) => !v)}
                className="text-sm text-blue-600 hover:underline mt-1"
              >
                {showModifiers ? '▲ Hide modifiers' : '▼ Combat modifiers'}
              </button>
              {showModifiers && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { key: 'attackBonus', label: 'Attack bonus' },
                    { key: 'damageBonus', label: 'Damage bonus' },
                    { key: 'playerThreshold', label: 'Player threshold' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2">
                      <label className="text-xs w-32 shrink-0">{label}</label>
                      <input
                        type="number"
                        value={
                          typeof combatModifiers[key] === 'number'
                            ? String(combatModifiers[key])
                            : ''
                        }
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          setCombatModifiers((prev) => ({
                            ...prev,
                            [key]: isNaN(v) ? undefined : v,
                          }))
                        }}
                        placeholder="0"
                        className="border rounded px-2 py-1 text-sm w-16"
                      />
                    </div>
                  ))}
                </div>
              )}

              {roundError && <p className="text-red-600 text-sm mt-2">{roundError}</p>}

              <div className="flex gap-2 mt-3">
                <button
                  onClick={resolveRound}
                  disabled={isResolving}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
                >
                  {isResolving ? 'Rolling…' : 'Resolve round'}
                </button>
                <button
                  onClick={flee}
                  className="px-4 py-2 border border-gray-400 rounded hover:bg-gray-100"
                >
                  Flee
                </button>
              </div>
            </div>
          )}

          {/* Post-roll overrides */}
          {pendingResult && (
            <div className="mb-4 border rounded p-3 bg-yellow-50">
              <h4 className="font-semibold mb-2 text-sm">Override round result?</h4>
              <div className={`grid gap-3 ${pendingResult.phaseTwoSkipped ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="text-xs block mb-1">Damage dealt</label>
                  <input
                    type="number"
                    min="0"
                    value={overrideDamageDealt}
                    onChange={(e) => setOverrideDamageDealt(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                  />
                </div>
                {!pendingResult.phaseTwoSkipped && (
                  <div>
                    <label className="text-xs block mb-1">Damage taken</label>
                    <input
                      type="number"
                      min="0"
                      value={overrideDamageTaken}
                      onChange={(e) => setOverrideDamageTaken(e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-full"
                    />
                  </div>
                )}
              </div>

              {/* Luck test buttons — Fighting Fantasy only */}
              {hasTestLuck && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-xs font-medium text-amber-800 mb-2">
                    Test Your Luck
                    {effectiveLuck > 0 && (
                      <span className="ml-1 text-amber-600">(Luck: {effectiveLuck})</span>
                    )}
                    {effectiveLuck <= 0 && (
                      <span className="ml-1 text-gray-400">(Luck exhausted)</span>
                    )}
                  </p>
                  <div className="flex flex-col gap-2">
                    {/* Attack luck button */}
                    {pendingResult.damageDealt > 0 && !luckAttackUsed && effectiveLuck > 0 && (
                      <button
                        onClick={() => handleLuckTest('attack')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium"
                      >
                        Test Luck (Attack) — Lucky: +2 dmg dealt · Unlucky: −1 dmg dealt
                      </button>
                    )}
                    {luckAttackUsed && (
                      <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1.5">
                        {luckResults.find(r => r.type === 'attack') && (() => {
                          const r = luckResults.find(lr => lr.type === 'attack')!
                          return (
                            <>
                              <span className="font-semibold">Attack luck:</span>{' '}
                              rolled {r.roll} —{' '}
                              <span className={r.success ? 'text-green-700' : 'text-red-700'}>
                                {r.success ? 'Lucky!' : 'Unlucky!'}
                              </span>{' '}
                              ({r.delta > 0 ? '+' : ''}{r.delta} dmg dealt)
                            </>
                          )
                        })()}
                      </div>
                    )}

                    {/* Defence luck button */}
                    {!pendingResult.phaseTwoSkipped && pendingResult.damageTaken > 0 && !luckDefenceUsed && effectiveLuck > 0 && (
                      <button
                        onClick={() => handleLuckTest('defence')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium"
                      >
                        Test Luck (Defence) — Lucky: −1 dmg taken · Unlucky: +1 dmg taken
                      </button>
                    )}
                    {luckDefenceUsed && (
                      <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1.5">
                        {luckResults.find(r => r.type === 'defence') && (() => {
                          const r = luckResults.find(lr => lr.type === 'defence')!
                          return (
                            <>
                              <span className="font-semibold">Defence luck:</span>{' '}
                              rolled {r.roll} —{' '}
                              <span className={r.success ? 'text-green-700' : 'text-red-700'}>
                                {r.success ? 'Lucky!' : 'Unlucky!'}
                              </span>{' '}
                              ({r.delta > 0 ? '+' : ''}{r.delta} dmg taken)
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {roundError && <p className="text-red-600 text-sm mt-2">{roundError}</p>}
              <button
                onClick={commitOverrides}
                disabled={isCommitting}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40 text-sm"
              >
                {isCommitting ? 'Committing…' : 'Commit round'}
              </button>
            </div>
          )}

          {/* Round log */}
          {(combat.rounds.length > 0 || typeof combat.metadata['startNarrative'] === 'string') && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Round log</h4>
              <div className="border rounded divide-y text-sm max-h-48 overflow-y-auto">
                {typeof combat.metadata['startNarrative'] === 'string' && (
                  <div className="text-sm border-b py-2 last:border-0">
                    <span className="font-semibold text-gray-500">Start:</span>{' '}
                    <span className="text-gray-600 italic">{combat.metadata['startNarrative'] as string}</span>
                  </div>
                )}
                {combat.rounds.map((r) => (
                  <RoundLogEntry key={r.id} round={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Finished combat */}
      {combat && combat.outcome !== 'in_progress' && (
        <div className="border rounded p-4 max-w-xl">
          <div
            className={`mb-4 p-3 rounded text-center font-bold text-lg ${
              combat.outcome === 'player_won'
                ? 'bg-green-100 text-green-800'
                : combat.outcome === 'enemy_knocked_out'
                  ? 'bg-amber-100 text-amber-800'
                  : combat.outcome === 'player_fled'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
            }`}
          >
            {combat.outcome === 'player_won' && `Victory over ${combat.enemyName}!`}
            {combat.outcome === 'enemy_knocked_out' && `${combat.enemyName} knocked unconscious!`}
            {combat.outcome === 'player_lost' && `Defeated by ${combat.enemyName}.`}
            {combat.outcome === 'player_fled' && `Fled from ${combat.enemyName}.`}
          </div>

          {/* Read-only round log */}
          {(combat.rounds.length > 0 || typeof combat.metadata['startNarrative'] === 'string') && (
            <div className="mb-4">
              <h4 className="font-semibold mb-2">Round log</h4>
              <div className="border rounded divide-y text-sm max-h-48 overflow-y-auto">
                {typeof combat.metadata['startNarrative'] === 'string' && (
                  <div className="text-sm border-b py-2 last:border-0">
                    <span className="font-semibold text-gray-500">Start:</span>{' '}
                    <span className="text-gray-600 italic">{combat.metadata['startNarrative'] as string}</span>
                  </div>
                )}
                {combat.rounds.map((r) => (
                  <RoundLogEntry key={r.id} round={r} />
                ))}
              </div>
            </div>
          )}
          {combat.rounds.length > 0 && (
            <div className="mb-4 text-sm text-gray-600 flex gap-6">
              <span>Damage dealt: <strong>{totalDamageDealt}</strong></span>
              <span>Damage taken: <strong>{totalDamageTaken}</strong></span>
            </div>
          )}

          {!isGameOver && (
            <button
              onClick={() => { setCombat(null); setStartError(null) }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Start new fight
            </button>
          )}
        </div>
      )}
    </section>
  )
}
