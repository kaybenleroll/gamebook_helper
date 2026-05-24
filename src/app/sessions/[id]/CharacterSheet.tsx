'use client'

import { useState, useEffect, useRef } from 'react'
import type { StatDefinition } from '../../../lib/game-systems/types'
import { xpThresholdProgress } from '../../../lib/game-systems/grail-quest'

interface EquipmentItem {
  name: string
  value: number
}

interface Props {
  sessionId: number
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
  statDefs: StatDefinition[]
  gameSystemId: string
  primaryHealthStat: string
  isGameOver?: boolean
  hasEquipment?: boolean
  hasTestLuck?: boolean
  hasGold?: boolean
  hasCodewords?: boolean
  experienceStatKey?: string
  metadata?: Record<string, unknown>
  onStatsChange?: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
  onMetadataChange?: (metadata: Record<string, unknown>) => void
}

export default function CharacterSheet({
  sessionId,
  stats: initialCurrentStats,
  initialStats,
  statDefs,
  gameSystemId,
  primaryHealthStat,
  isGameOver = false,
  hasEquipment = false,
  hasTestLuck = false,
  hasGold = false,
  hasCodewords = false,
  experienceStatKey,
  metadata: initialMetadata,
  onStatsChange,
  onMetadataChange,
}: Props) {
  const [currentStats, setCurrentStats] = useState(initialCurrentStats)
  const [currentInitialStats, setCurrentInitialStats] = useState(initialStats)
  const [statInputs, setStatInputs] = useState<Record<string, string>>({})
  const [initialStatInputs, setInitialStatInputs] = useState<Record<string, string>>({})
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [editingCell, setEditingCell] = useState<{ id: string; value: string } | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Gold Pieces and Codewords state (Fighting Fantasy only)
  const [gold, setGold] = useState<number>(
    typeof initialMetadata?.gold === 'number' ? initialMetadata.gold : 0,
  )
  const [codewords, setCodewords] = useState<string[]>(
    Array.isArray(initialMetadata?.codewords) ? (initialMetadata.codewords as string[]) : [],
  )
  const [newCodeword, setNewCodeword] = useState('')

  // Sync metadata when parent passes updated values
  useEffect(() => {
    if (typeof initialMetadata?.gold === 'number') setGold(initialMetadata.gold)
  }, [initialMetadata?.gold])

  useEffect(() => {
    if (Array.isArray(initialMetadata?.codewords)) setCodewords(initialMetadata.codewords as string[])
  }, [initialMetadata?.codewords])

  // Sync when parent (LeftColumnClient) updates shared stats — e.g. after a CombatPanel round
  useEffect(() => {
    setCurrentStats(initialCurrentStats)
  }, [initialCurrentStats])

  useEffect(() => {
    setCurrentInitialStats(initialStats)
  }, [initialStats])

  // Weapon form state
  const equippedWeapon = currentStats['weapon'] as EquipmentItem | undefined
  const equippedArmour = currentStats['armour'] as EquipmentItem | undefined
  const [weaponName, setWeaponName] = useState(equippedWeapon?.name ?? '')
  const [weaponDamage, setWeaponDamage] = useState(
    equippedWeapon?.value !== undefined ? String(equippedWeapon.value) : '',
  )
  const [armourName, setArmourName] = useState(equippedArmour?.name ?? '')
  const [armourReduction, setArmourReduction] = useState(
    equippedArmour?.value !== undefined ? String(equippedArmour.value) : '',
  )

  async function patchCharacter(payload: Record<string, unknown>) {
    const wasGameOver = ((currentStats[primaryHealthStat] as number | undefined) ?? 1) <= 0
    const res = await fetch(`/api/sessions/${sessionId}/character`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        stats: Record<string, unknown>
        initialStats: Record<string, unknown>
      }
      setCurrentStats(data.stats)
      if (data.initialStats) setCurrentInitialStats(data.initialStats)
      onStatsChange?.(data.stats, data.initialStats ?? currentInitialStats)
      const nowGameOver = ((data.stats[primaryHealthStat] as number | undefined) ?? 1) <= 0
      if (!wasGameOver && nowGameOver) setShowGameOverModal(true)
    }
  }

  async function patchMetadata(patch: Record<string, unknown>) {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: patch }),
    })
    if (res.ok) {
      const data = (await res.json()) as { metadata?: Record<string, unknown> }
      if (data.metadata) onMetadataChange?.(data.metadata)
    }
  }

  function adjust(stat: string, delta: number) {
    return patchCharacter({ stat, delta })
  }

  function parseAndApply(statKey: string, input: string, target: 'current' | 'initial') {
    const trimmed = input.trim()
    if (!trimmed) return
    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
      const delta = Number(trimmed)
      if (!isNaN(delta)) patchCharacter({ stat: statKey, delta, target })
    } else {
      const value = Number(trimmed)
      if (!isNaN(value)) patchCharacter({ stat: statKey, value, target })
    }
    if (target === 'current') {
      setStatInputs((prev) => ({ ...prev, [statKey]: '' }))
    } else {
      setInitialStatInputs((prev) => ({ ...prev, [statKey]: '' }))
    }
  }

  // Auto-focus the inline edit input when it mounts
  useEffect(() => {
    if (editingCell) {
      editInputRef.current?.focus()
    }
  }, [editingCell])

  function startEdit(statKey: string, currentValue: number) {
    setEditingCell({ id: statKey, value: String(currentValue) })
  }

  function commitEdit(statKey: string, originalValue: number) {
    if (!editingCell) return
    const trimmed = editingCell.value.trim()
    if (trimmed !== '' && !isNaN(Number(trimmed))) {
      patchCharacter({ stat: statKey, value: Number(trimmed), target: 'current' })
    }
    setEditingCell(null)
  }

  function cancelEdit() {
    setEditingCell(null)
  }

  async function saveEquipment(slot: 'weapon' | 'armour', name: string, value: string) {
    const numValue = parseInt(value, 10)
    if (!name.trim() || isNaN(numValue)) return
    const res = await fetch(`/api/sessions/${sessionId}/character`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipment: slot, item: { name: name.trim(), value: numValue } }),
    })
    if (res.ok) {
      const data = (await res.json()) as { stats: Record<string, unknown>; initialStats?: Record<string, unknown> }
      setCurrentStats(data.stats)
      onStatsChange?.(data.stats, data.initialStats ?? currentInitialStats)
    }
  }

  function handleGoldChange(delta: number) {
    const newGold = Math.max(0, gold + delta)
    setGold(newGold)
    void patchMetadata({ gold: newGold })
  }

  function handleAddCodeword() {
    const trimmed = newCodeword.trim()
    if (!trimmed || codewords.includes(trimmed)) return
    const updated = [...codewords, trimmed]
    setCodewords(updated)
    setNewCodeword('')
    void patchMetadata({ codewords: updated })
  }

  function handleRemoveCodeword(word: string) {
    const updated = codewords.filter((w) => w !== word)
    setCodewords(updated)
    void patchMetadata({ codewords: updated })
  }

  // Test Your Luck state (systems with testLuck only)
  const [luckTestResult, setLuckTestResult] = useState<{
    roll: number
    success: boolean
    newLuck: number
    message: string
  } | null>(null)
  const [luckTestLoading, setLuckTestLoading] = useState(false)

  async function handleTestLuck() {
    setLuckTestLoading(true)
    setLuckTestResult(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/actions/test-luck`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = (await res.json()) as {
          roll: number
          success: boolean
          newLuck: number
          message: string
          stats: Record<string, unknown>
          initialStats: Record<string, unknown>
        }
        setLuckTestResult({ roll: data.roll, success: data.success, newLuck: data.newLuck, message: data.message })
        setCurrentStats(data.stats)
        onStatsChange?.(data.stats, data.initialStats)
      } else {
        const err = (await res.json()) as { error?: string }
        setLuckTestResult(null)
        // Surface a minimal inline error using the message field
        setLuckTestResult({ roll: 0, success: false, newLuck: 0, message: err.error ?? 'Test Your Luck failed.' })
      }
    } finally {
      setLuckTestLoading(false)
    }
  }

  return (
    <section>
      <h2 className="font-heading text-lg text-header-accent border-l-4 border-header-accent pl-3 mb-3">Character Sheet</h2>
      <table className="border-collapse w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4 font-body text-text-muted font-medium">Stat</th>
            <th className="py-2 font-body text-text-muted font-medium">Current</th>
          </tr>
        </thead>
        <tbody>
          {statDefs.map((stat) => {
            const current =
              typeof currentStats[stat.key] === 'number'
                ? (currentStats[stat.key] as number)
                : stat.min
            const startingMax =
              typeof currentInitialStats[stat.key] === 'number'
                ? (currentInitialStats[stat.key] as number)
                : stat.min
            const atMin = current <= stat.min
            // For stats with a hard max (e.g. LP), cap at min(hardMax, initialStats value).
            // For stats with no hard max (e.g. XP), there is no cap.
            const atMax =
              stat.max !== undefined
                ? current >= Math.min(stat.max, startingMax)
                : false
            const isLPStat = stat.key === primaryHealthStat && stat.max !== undefined
            const lpPercent = isLPStat && startingMax > 0
              ? Math.max(0, Math.min(100, (current / startingMax) * 100))
              : 0
            const isEditing = editingCell?.id === stat.key
            return (
              <tr key={stat.key} className="border-b last:border-0">
                <td className="py-2 pr-4 font-body text-text-muted align-top w-28">{stat.label}</td>
                <td className="py-2">
                  <div className="flex flex-col gap-1">
                    {/* Row 1: current controls */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        onClick={() => adjust(stat.key, -5)}
                        disabled={isGameOver || atMin}
                        className="w-8 h-7 rounded border text-sm font-bold disabled:opacity-40"
                        aria-label={`Decrease ${stat.label} by 5`}
                      >
                        −5
                      </button>
                      <button
                        onClick={() => adjust(stat.key, -1)}
                        disabled={isGameOver || atMin}
                        className="w-7 h-7 rounded border font-bold disabled:opacity-40"
                        aria-label={`Decrease ${stat.label}`}
                      >
                        −
                      </button>
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingCell.value}
                          onChange={(e) => setEditingCell({ id: stat.key, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(stat.key, current)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          onBlur={() => commitEdit(stat.key, current)}
                          className="font-mono text-accent-blue w-16 border-b border-accent-blue bg-transparent outline-none text-right"
                          aria-label={`Edit ${stat.label}`}
                        />
                      ) : (
                        <span
                          className="font-mono text-accent-blue w-8 text-center cursor-pointer hover:underline"
                          onClick={() => !isGameOver && startEdit(stat.key, current)}
                          title="Click to edit"
                        >
                          {current}
                        </span>
                      )}
                      <button
                        onClick={() => adjust(stat.key, +1)}
                        disabled={isGameOver || atMax}
                        className="w-7 h-7 rounded border font-bold disabled:opacity-40"
                        aria-label={`Increase ${stat.label}`}
                      >
                        +
                      </button>
                      <button
                        onClick={() => adjust(stat.key, +5)}
                        disabled={isGameOver || atMax}
                        className="w-8 h-7 rounded border text-sm font-bold disabled:opacity-40"
                        aria-label={`Increase ${stat.label} by 5`}
                      >
                        +5
                      </button>
                      <input
                        type="text"
                        value={statInputs[stat.key] ?? ''}
                        onChange={(e) =>
                          setStatInputs((prev) => ({ ...prev, [stat.key]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') parseAndApply(stat.key, statInputs[stat.key] ?? '', 'current')
                        }}
                        placeholder="+5 / 32"
                        className="w-24 border rounded px-1 py-0.5 text-sm font-mono"
                        aria-label={`Set ${stat.label}`}
                      />
                      <button
                        onClick={() => parseAndApply(stat.key, statInputs[stat.key] ?? '', 'current')}
                        disabled={!(statInputs[stat.key] ?? '').trim()}
                        className="px-2 py-0.5 text-sm border rounded disabled:opacity-40"
                        aria-label={`Apply ${stat.label} change`}
                      >
                        Apply
                      </button>
                    </div>

                    {/* LP progress bar (only for primary health stat) */}
                    {isLPStat && (
                      <div className="w-full bg-panel-border rounded-full h-2 mt-0.5 mb-1">
                        <div
                          className="bg-progress-fill h-2 rounded-full transition-all"
                          style={{ width: `${lpPercent}%` }}
                        />
                      </div>
                    )}

                    {/* XP threshold text */}
                    {experienceStatKey !== undefined && stat.key === experienceStatKey && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {(() => {
                          const { progress, threshold } = xpThresholdProgress(current)
                          return `${progress} / ${threshold} XP to next LP`
                        })()}
                      </div>
                    )}

                    {/* Row 2: Starting — only for stats with a max */}
                    {stat.max !== undefined && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-body text-text-muted text-xs">Starting:</span>
                        <span className="font-mono text-accent-blue text-sm">{startingMax}</span>
                        <input
                          type="text"
                          value={initialStatInputs[stat.key] ?? ''}
                          onChange={(e) =>
                            setInitialStatInputs((prev) => ({ ...prev, [stat.key]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              parseAndApply(stat.key, initialStatInputs[stat.key] ?? '', 'initial')
                          }}
                          placeholder="+5 / 32"
                          className="w-20 border rounded px-1 py-0.5 text-xs font-mono"
                          aria-label={`Set starting ${stat.label}`}
                        />
                        <button
                          onClick={() =>
                            parseAndApply(stat.key, initialStatInputs[stat.key] ?? '', 'initial')
                          }
                          disabled={!(initialStatInputs[stat.key] ?? '').trim()}
                          className="px-2 py-0.5 text-xs border rounded disabled:opacity-40"
                          aria-label={`Apply starting ${stat.label} change`}
                        >
                          Set
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {hasEquipment && (
        <div className="mt-4 w-full space-y-3">
          {/* Equipped weapon */}
          <div className="flex items-center gap-2">
            <span className="w-32 text-sm font-medium shrink-0">Equipped weapon</span>
            <input
              type="text"
              value={weaponName}
              onChange={(e) => setWeaponName(e.target.value)}
              placeholder="Name"
              className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
              aria-label="Weapon name"
            />
            <input
              type="number"
              value={weaponDamage}
              onChange={(e) => setWeaponDamage(e.target.value)}
              placeholder="Dmg"
              className="border rounded px-2 py-1 text-sm w-16 shrink-0"
              aria-label="Weapon damage"
            />
            <button
              onClick={() => saveEquipment('weapon', weaponName, weaponDamage)}
              disabled={!weaponName.trim() || weaponDamage === ''}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40"
            >
              Save
            </button>
          </div>

          {/* Equipped armour */}
          <div className="flex items-center gap-2">
            <span className="w-32 text-sm font-medium shrink-0">Equipped armour</span>
            <input
              type="text"
              value={armourName}
              onChange={(e) => setArmourName(e.target.value)}
              placeholder="Name"
              className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
              aria-label="Armour name"
            />
            <input
              type="number"
              value={armourReduction}
              onChange={(e) => setArmourReduction(e.target.value)}
              placeholder="DR"
              className="border rounded px-2 py-1 text-sm w-16 shrink-0"
              aria-label="Armour damage reduction"
            />
            <button
              onClick={() => saveEquipment('armour', armourName, armourReduction)}
              disabled={!armourName.trim() || armourReduction === ''}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {hasTestLuck && (() => {
        const currentLuck =
          typeof currentStats['luck'] === 'number' ? (currentStats['luck'] as number) : 0
        const luckDepleted = currentLuck <= 0
        return (
          <div className="mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleTestLuck}
                disabled={isGameOver || luckDepleted || luckTestLoading}
                className="px-4 py-1.5 text-sm border rounded font-medium disabled:opacity-40"
                aria-label="Test Your Luck"
              >
                {luckTestLoading ? 'Testing…' : 'Test Your Luck'}
              </button>
              {luckDepleted && (
                <span className="text-xs text-text-muted">Luck is 0 — cannot test</span>
              )}
            </div>
            {luckTestResult && (
              <div
                className={`mt-2 px-3 py-2 rounded text-sm border ${
                  luckTestResult.success
                    ? 'border-green-400 bg-green-50 text-green-800'
                    : 'border-red-400 bg-red-50 text-red-800'
                }`}
                role="status"
                aria-live="polite"
              >
                {luckTestResult.message}
              </div>
            )}
          </div>
        )
      })()}
      {(hasGold || hasCodewords) && (
        <div className="mt-4 space-y-4">
          {/* Gold Pieces counter */}
          {hasGold && (
            <div>
              <h3 className="font-body text-text-muted font-medium text-sm mb-1">Gold Pieces</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleGoldChange(-1)}
                  disabled={gold <= 0}
                  className="w-7 h-7 rounded border font-bold disabled:opacity-40"
                  aria-label="Decrease gold by 1"
                >
                  −
                </button>
                <span className="font-mono text-accent-blue w-10 text-center text-lg" aria-label={`Gold: ${gold}`}>
                  {gold}
                </span>
                <button
                  onClick={() => handleGoldChange(+1)}
                  className="w-7 h-7 rounded border font-bold"
                  aria-label="Increase gold by 1"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Codewords checklist */}
          {hasCodewords && (
            <div>
              <h3 className="font-body text-text-muted font-medium text-sm mb-1">Codewords</h3>
              {codewords.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {codewords.map((word) => (
                    <li key={word} className="flex items-center gap-2">
                      <span className="font-mono text-sm">{word}</span>
                      <button
                        onClick={() => handleRemoveCodeword(word)}
                        className="text-text-muted hover:text-red-600 text-xs px-1"
                        aria-label={`Remove codeword ${word}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCodeword}
                  onChange={(e) => setNewCodeword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCodeword()
                  }}
                  placeholder="New codeword"
                  className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
                  aria-label="New codeword"
                />
                <button
                  onClick={handleAddCodeword}
                  disabled={!newCodeword.trim()}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {showGameOverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 text-center">
            <h2 className="text-xl font-bold text-red-700 mb-3">Game Over</h2>
            <p className="text-gray-700 mb-6">
              Your Life Points have reached zero — your adventure is over.
            </p>
            <button
              onClick={() => setShowGameOverModal(false)}
              className="px-6 py-2 bg-red-700 text-white rounded font-semibold hover:bg-red-800"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
