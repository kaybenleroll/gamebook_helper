'use client'

import { useReducer, useState } from 'react'
import type { CombatModule, RoundOption } from '../../../lib/game-systems/types'
import {
  combatReducer,
  resolveEnemyHp,
  type CombatData,
  type LuckResult,
  type RoundApiResponse,
  type LuckTestApiResponse,
} from './combat/types'
import { HpBar } from './combat/HpBar'
import { RoundLog } from './combat/RoundLog'
import { RoundPanel } from './combat/RoundPanel'
import { EnemyCreationForm } from './combat/EnemyCreationForm'
import { XpModal } from './combat/XpModal'
import { FinishedCombatPanel } from './combat/FinishedCombatPanel'

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

interface EnemyFormState { [key: string]: string }

// Initialise enemy form with weapon/armour defaults from character stats
function initialEnemyForm(characterStats: Record<string, unknown>): EnemyFormState {
  const form: EnemyFormState = {}
  const weapon = (characterStats.weapon as { value?: number } | undefined)?.value
  const armour = (characterStats.armour as { value?: number } | undefined)?.value
  if (weapon !== undefined) form['playerDamageBonus'] = String(weapon)
  if (armour !== undefined) form['playerArmourReduction'] = String(armour)
  return form
}

export default function CombatPanel({
  sessionId, initialCombat, enemyStatFields, characterStats, initialStats,
  isGameOver, onStatsChange, primaryHealthStat, primaryEnemyHealthStat, onCombatEnd, hasTestLuck,
}: Props) {
  const [combat, setCombat] = useState<CombatData | null>(initialCombat)
  const [enemyForm, setEnemyForm] = useState<EnemyFormState>(() => initialEnemyForm(characterStats))
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [roundOptions, setRoundOptions] = useState<Record<string, unknown>>({})
  const [combatModifiers, setCombatModifiers] = useState<Record<string, unknown>>({})
  const [showModifiers, setShowModifiers] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [roundError, setRoundError] = useState<string | null>(null)
  const [showXpModal, setShowXpModal] = useState(false)
  const [xpInput, setXpInput] = useState('')
  const [isSavingXp, setIsSavingXp] = useState(false)

  // Combat state machine — replaces 8 correlated useState hooks for round lifecycle
  const [phaseState, dispatch] = useReducer(combatReducer, { phase: 'idle' })

  const stats = characterStats as Record<string, unknown>
  const currentLuck = typeof stats['luck'] === 'number' ? (stats['luck'] as number) : 0
  const localLuckSpent = phaseState.phase === 'pendingCommit' ? phaseState.localLuckSpent : 0
  const effectiveLuck = currentLuck - localLuckSpent

  // Applies a resolved round API response to local combat state
  function applyRoundResponse(data: RoundApiResponse) {
    setCombat((prev) =>
      prev
        ? { ...prev, enemyState: data.combat.enemyState, outcome: data.combat.outcome, endedAt: data.combat.endedAt, availableRoundOptions: data.combat.availableRoundOptions, rounds: [...prev.rounds, data.round] }
        : null
    )
    onStatsChange(data.characterStats, data.characterInitialStats)
    if (data.xpPrompt) setShowXpModal(true)
  }

  async function startFight() {
    setIsStarting(true); setStartError(null)
    try {
      const payload: Record<string, unknown> = {}
      const name = (enemyForm['enemyName'] ?? '').trim()
      if (name) payload['name'] = name
      for (const field of enemyStatFields) {
        const raw = enemyForm[field.key] ?? (field.default !== undefined ? String(field.default) : '')
        if (field.type === 'number') { const n = parseFloat(raw); if (!isNaN(n)) payload[field.key] = n }
        else if (raw.trim()) payload[field.key] = raw.trim()
      }
      const res = await fetch(`/api/sessions/${sessionId}/combats`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (res.ok) {
        setCombat((await res.json()) as CombatData)
        setEnemyForm(initialEnemyForm(characterStats))
        setRoundOptions({}); setCombatModifiers({})
        dispatch({ type: 'RESET_PENDING' })
      } else {
        const err = (await res.json()) as { error?: string; details?: string[] }
        setStartError(err.details?.join(', ') ?? err.error ?? 'Failed to start combat')
      }
    } finally { setIsStarting(false) }
  }

  async function resolveRound() {
    if (!combat) return
    dispatch({ type: 'START_ROLLING' }); setIsResolving(true); setRoundError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}/rounds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chosenOptions: roundOptions, combatModifiers }) })
      if (res.ok) {
        const data = (await res.json()) as RoundApiResponse
        applyRoundResponse(data)
        dispatch({ type: 'ROUND_RESOLVED', damageDealt: data.round.damageDealt, damageTaken: data.round.damageTaken, phaseTwoSkipped: data.round.detail['phaseTwoSkipped'] === true })
        setRoundOptions({})
      } else {
        const err = (await res.json()) as { error?: string }
        setRoundError(err.error ?? 'Failed to resolve round')
        dispatch({ type: 'RESET_PENDING' })
      }
    } finally { setIsResolving(false) }
  }

  async function handleLuckTest(type: 'attack' | 'defence') {
    if (phaseState.phase !== 'pendingCommit') return
    const res = await fetch(`/api/sessions/${sessionId}/actions/test-luck`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    if (!res.ok) return
    const data = (await res.json()) as LuckTestApiResponse
    let delta = 0
    let newDamageDealt = phaseState.overrideDamageDealt
    let newDamageTaken = phaseState.overrideDamageTaken
    if (type === 'attack') {
      delta = data.success ? 2 : -1
      const base = parseInt(phaseState.overrideDamageDealt, 10)
      newDamageDealt = String(Math.max(0, (isNaN(base) ? phaseState.damageDealt : base) + delta))
    } else {
      delta = data.success ? -1 : 1
      const base = parseInt(phaseState.overrideDamageTaken, 10)
      newDamageTaken = String(Math.max(0, (isNaN(base) ? phaseState.damageTaken : base) + delta))
    }
    const luckResult: LuckResult = { type, roll: data.roll, success: data.success, delta, message: data.message }
    dispatch({ type: 'LUCK_TESTED', luckType: type, result: luckResult, newDamageDealt, newDamageTaken })
    onStatsChange(data.stats, data.initialStats)
  }

  async function commitOverrides() {
    if (!combat || phaseState.phase !== 'pendingCommit' || !combat.rounds[combat.rounds.length - 1]) return
    const { damageDealt, damageTaken, overrideDamageDealt, overrideDamageTaken, luckResults } = phaseState
    const ddo = parseInt(overrideDamageDealt, 10)
    const dto = parseInt(overrideDamageTaken, 10)
    const hasOverride = (!isNaN(ddo) && ddo !== damageDealt) || (!isNaN(dto) && dto !== damageTaken)
    if (!hasOverride && luckResults.length === 0) { dispatch({ type: 'RESET_PENDING' }); return }
    setIsCommitting(true); setRoundError(null)
    try {
      const overridesPayload: { damageDealt?: number; damageTaken?: number } = {}
      if (!isNaN(ddo) && ddo !== damageDealt) overridesPayload.damageDealt = ddo
      if (!isNaN(dto) && dto !== damageTaken) overridesPayload.damageTaken = dto
      const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}/rounds`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenOptions: roundOptions, combatModifiers, overrides: Object.keys(overridesPayload).length > 0 ? overridesPayload : undefined, ...(luckResults.length > 0 ? { luckResults } : {}) }),
      })
      if (res.ok) { applyRoundResponse((await res.json()) as RoundApiResponse); dispatch({ type: 'COMMITTED' }) }
      else { const err = (await res.json()) as { error?: string }; setRoundError(err.error ?? 'Failed to commit overrides') }
    } finally { setIsCommitting(false) }
  }

  async function flee() {
    if (!combat) return
    const res = await fetch(`/api/sessions/${sessionId}/combats/${combat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'player_fled', endedAt: new Date().toISOString() }) })
    if (res.ok) setCombat((await res.json()) as CombatData)
  }

  async function awardXp() {
    const xp = parseInt(xpInput, 10)
    if (isNaN(xp) || xp < 0) return
    setIsSavingXp(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/character`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stat: 'experiencePoints', delta: xp }) })
      if (res.ok) { const data = (await res.json()) as { stats: Record<string, unknown>; initialStats: Record<string, unknown> }; onStatsChange(data.stats, data.initialStats) }
    } finally { setIsSavingXp(false); setShowXpModal(false); setXpInput(''); onCombatEnd?.() }
  }

  // ---- Derived values ----

  const activeCombatOptions: RoundOption[] = combat?.outcome === 'in_progress' ? (combat.availableRoundOptions ?? []) : []
  const enemyHp = combat ? resolveEnemyHp(combat, primaryEnemyHealthStat) : { current: 0, max: 0 }
  const playerCurrentHp = typeof characterStats[primaryHealthStat] === 'number' ? (characterStats[primaryHealthStat] as number) : 0
  const playerMaxHp = typeof initialStats[primaryHealthStat] === 'number' ? (initialStats[primaryHealthStat] as number) : 0
  const totalDamageDealt = combat?.rounds.reduce((s, r) => s + r.damageDealt, 0) ?? 0
  const totalDamageTaken = combat?.rounds.reduce((s, r) => s + r.damageTaken, 0) ?? 0
  const pendingResult = phaseState.phase === 'pendingCommit' ? phaseState : null
  const startNarrative = combat && typeof combat.metadata['startNarrative'] === 'string' ? (combat.metadata['startNarrative'] as string) : undefined
  const enemyHpLabel = `${combat?.enemyName ?? ''} ${enemyStatFields.find((f) => f.key === primaryEnemyHealthStat)?.label ?? primaryEnemyHealthStat}`

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

      {showXpModal && (
        <XpModal xpInput={xpInput} isSavingXp={isSavingXp} onXpInputChange={setXpInput} onAward={awardXp}
          onSkip={() => { setShowXpModal(false); setXpInput(''); onCombatEnd?.() }} />
      )}

      {!combat && !isGameOver && (
        <EnemyCreationForm enemyStatFields={enemyStatFields} enemyForm={enemyForm} onFormChange={setEnemyForm}
          onSubmit={startFight} isStarting={isStarting} startError={startError} />
      )}

      {combat && combat.outcome === 'in_progress' && (
        <div className="border rounded p-4 max-w-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Fighting: {combat.enemyName}</h3>
            {combat.metadata['initiativeWinner'] === 'player' && <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">You have initiative</span>}
            {combat.metadata['initiativeWinner'] === 'enemy' && <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded">Enemy has initiative</span>}
          </div>
          <div className="mb-4">
            <HpBar current={enemyHp.current} max={enemyHp.max} label={enemyHpLabel} />
            <HpBar current={playerCurrentHp} max={playerMaxHp} label="Your Life Points" />
          </div>
          {combat.rounds.length > 0 && (
            <div className="mb-4 text-sm text-gray-600 flex gap-6">
              <span>Damage dealt: <strong>{totalDamageDealt}</strong></span>
              <span>Damage taken: <strong>{totalDamageTaken}</strong></span>
            </div>
          )}
          <RoundPanel
            activeCombatOptions={activeCombatOptions} roundOptions={roundOptions} onRoundOptionChange={setRoundOptions}
            combatModifiers={combatModifiers} onCombatModifierChange={setCombatModifiers}
            showModifiers={showModifiers} onToggleModifiers={() => setShowModifiers((v) => !v)}
            isResolving={isResolving} onResolveRound={resolveRound} onFlee={flee}
            pendingResult={pendingResult}
            onOverrideDamageDealt={(v) => dispatch({ type: 'OVERRIDE_DAMAGE_DEALT', value: v })}
            onOverrideDamageTaken={(v) => dispatch({ type: 'OVERRIDE_DAMAGE_TAKEN', value: v })}
            onLuckTest={handleLuckTest} effectiveLuck={effectiveLuck} hasTestLuck={hasTestLuck}
            isCommitting={isCommitting} onCommitOverrides={commitOverrides} roundError={roundError}
          />
          {(combat.rounds.length > 0 || startNarrative) && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Round log</h4>
              <RoundLog rounds={combat.rounds} startNarrative={startNarrative} />
            </div>
          )}
        </div>
      )}

      {combat && combat.outcome !== 'in_progress' && (
        <FinishedCombatPanel combat={combat} totalDamageDealt={totalDamageDealt} totalDamageTaken={totalDamageTaken}
          isGameOver={isGameOver} onNewFight={() => { setCombat(null); setStartError(null); dispatch({ type: 'RESET_PENDING' }) }} />
      )}
    </section>
  )
}
