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

function RoundLogEntry({ round }: { round: CombatRound }) {
  const detail = round.detail as Record<string, unknown>
  const narrative =
    typeof detail['narrative'] === 'string'
      ? detail['narrative']
      : `Round ${round.roundNumber} — dealt ${round.damageDealt}, taken ${round.damageTaken}`
  return (
    <div className="text-sm border-b py-2 last:border-0">
      <span className="font-semibold">Round {round.roundNumber}:</span>{' '}
      <span className="text-gray-700">{narrative}</span>
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
}: Props) {
  const [combat, setCombat] = useState<CombatData | null>(initialCombat)
  const [showStartForm, setShowStartForm] = useState(false)
  const [enemyForm, setEnemyForm] = useState<EnemyFormState>({})
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
  } | null>(null)
  const [overrideDamageDealt, setOverrideDamageDealt] = useState('')
  const [overrideDamageTaken, setOverrideDamageTaken] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)

  // XP modal state
  const [showXpModal, setShowXpModal] = useState(false)
  const [xpInput, setXpInput] = useState('')
  const [isSavingXp, setIsSavingXp] = useState(false)

  const [roundError, setRoundError] = useState<string | null>(null)

  // ---- Start fight ----

  async function startFight() {
    setIsStarting(true)
    setStartError(null)
    try {
      // Convert form values to correct types
      const payload: Record<string, unknown> = {}
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
        setShowStartForm(false)
        setEnemyForm({})
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
        })
        setOverrideDamageDealt(String(data.round.damageDealt))
        setOverrideDamageTaken(String(data.round.damageTaken))
        // Reset round options
        setRoundOptions({})
        if (data.xpPrompt) {
          setShowXpModal(true)
        }
        if (data.combat.outcome !== 'in_progress') {
          onCombatEnd?.()
        }
      } else {
        const err = (await res.json()) as { error?: string }
        setRoundError(err.error ?? 'Failed to resolve round')
      }
    } finally {
      setIsResolving(false)
    }
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

    if (!hasOverride) {
      setPendingResult(null)
      return
    }

    setIsCommitting(true)
    setRoundError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosenOptions: roundOptions,
          combatModifiers,
          overrides: {
            ...(damageDealtOverride !== pendingResult.damageDealt
              ? { damageDealt: damageDealtOverride }
              : {}),
            ...(damageTakenOverride !== pendingResult.damageTaken
              ? { damageTaken: damageTakenOverride }
              : {}),
          },
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
        if (data.xpPrompt) setShowXpModal(true)
        if (data.combat.outcome !== 'in_progress') {
          onCombatEnd?.()
        }
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
      onCombatEnd?.()
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
    }
  }

  // ---- Helpers ----

  const activeCombatOptions: RoundOption[] = combat?.outcome === 'in_progress'
    ? (combat.availableRoundOptions ?? [])
    : []

  const enemyHpKey = primaryEnemyHealthStat
  const enemyCurrentHpKey = 'current' + primaryEnemyHealthStat.charAt(0).toUpperCase() + primaryEnemyHealthStat.slice(1)
  const enemyCurrentHp =
    typeof (combat?.enemyState as Record<string, unknown> | undefined)?.[enemyCurrentHpKey] === 'number'
      ? ((combat!.enemyState as Record<string, unknown>)[enemyCurrentHpKey] as number)
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
                onClick={() => { setShowXpModal(false); setXpInput('') }}
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

      {/* No active combat — start form or button */}
      {!combat && !isGameOver && (
        <>
          {!showStartForm ? (
            <button
              onClick={() => setShowStartForm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Start fight
            </button>
          ) : (
            <div className="border rounded p-4 max-w-md">
              <h3 className="font-semibold mb-3">New fight</h3>
              {enemyStatFields.map((field) => (
                <div key={field.key} className="flex items-center gap-2 mb-2">
                  <label className="w-28 text-sm shrink-0">
                    {field.label}
                    {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={
                      enemyForm[field.key] !== undefined
                        ? enemyForm[field.key]
                        : field.default !== undefined
                          ? String(field.default)
                          : ''
                    }
                    min={field.type === 'number' && (field.key === 'enemyDamageBonus' || field.key === 'playerDamageBonus') ? 0 : undefined}
                    onChange={(e) =>
                      setEnemyForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="border rounded px-2 py-1 text-sm flex-1"
                    aria-label={field.label}
                  />
                </div>
              ))}
              {startError && <p className="text-red-600 text-sm mb-2">{startError}</p>}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={startFight}
                  disabled={isStarting}
                  className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-40"
                >
                  {isStarting ? 'Starting…' : 'Start'}
                </button>
                <button
                  onClick={() => { setShowStartForm(false); setStartError(null) }}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Active combat */}
      {combat && combat.outcome === 'in_progress' && (
        <div className="border rounded p-4 max-w-xl">
          <h3 className="font-bold text-lg mb-4">Fighting: {combat.enemyName}</h3>

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
              <div className="grid grid-cols-2 gap-3">
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
              </div>
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
          {combat.rounds.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Round log</h4>
              <div className="border rounded divide-y text-sm max-h-48 overflow-y-auto">
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
                : combat.outcome === 'player_fled'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
            }`}
          >
            {combat.outcome === 'player_won' && `Victory over ${combat.enemyName}!`}
            {combat.outcome === 'player_lost' && `Defeated by ${combat.enemyName}.`}
            {combat.outcome === 'player_fled' && `Fled from ${combat.enemyName}.`}
          </div>

          {/* Read-only round log */}
          {combat.rounds.length > 0 && (
            <div className="mb-4">
              <h4 className="font-semibold mb-2">Round log</h4>
              <div className="border rounded divide-y text-sm max-h-48 overflow-y-auto">
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
              onClick={() => { setCombat(null); setShowStartForm(false) }}
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
