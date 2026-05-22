'use client'

import { useState } from 'react'
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
  onStatsChange?: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
}

export default function CharacterSheet({
  sessionId,
  stats: initialCurrentStats,
  initialStats,
  statDefs,
  gameSystemId,
  primaryHealthStat,
  isGameOver = false,
  onStatsChange,
}: Props) {
  const [currentStats, setCurrentStats] = useState(initialCurrentStats)
  const [currentInitialStats, setCurrentInitialStats] = useState(initialStats)
  const [statInputs, setStatInputs] = useState<Record<string, string>>({})
  const [initialStatInputs, setInitialStatInputs] = useState<Record<string, string>>({})
  const [showGameOverModal, setShowGameOverModal] = useState(false)

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

  const isGrailQuest = gameSystemId === 'grail-quest'

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Character Sheet</h2>
      <table className="border-collapse w-full max-w-md">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4 font-medium">Stat</th>
            <th className="py-2 pr-4 font-medium text-center">Current</th>
            <th className="py-2 font-medium text-right">Starting</th>
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
            return (
              <tr key={stat.key} className="border-b last:border-0">
                <td className="py-2 pr-4">{stat.label}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center justify-center gap-1">
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
                    <span className="font-mono w-8 text-center">{current}</span>
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
                      className="w-16 border rounded px-1 py-0.5 text-sm font-mono"
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
                  {isGrailQuest && stat.key === 'experiencePoints' && (
                    <div className="text-xs text-gray-500 text-center mt-1">
                      {(() => {
                        const { progress, threshold } = xpThresholdProgress(current)
                        return `${progress} / ${threshold} XP to next LP`
                      })()}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-gray-500">
                  {stat.max !== undefined ? (
                    <div className="flex items-center justify-end gap-1">
                      <span>{startingMax}</span>
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
                        className="w-16 border rounded px-1 py-0.5 text-sm font-mono text-left"
                        aria-label={`Set starting ${stat.label}`}
                      />
                      <button
                        onClick={() =>
                          parseAndApply(stat.key, initialStatInputs[stat.key] ?? '', 'initial')
                        }
                        disabled={!(initialStatInputs[stat.key] ?? '').trim()}
                        className="px-2 py-0.5 text-sm border rounded disabled:opacity-40"
                        aria-label={`Apply starting ${stat.label} change`}
                      >
                        Set
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {isGrailQuest && (
        <div className="mt-4 max-w-md space-y-3">
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
