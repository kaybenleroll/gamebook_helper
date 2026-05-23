'use client'

import { useState } from 'react'
import type { SpellDefinition } from '../../../lib/game-systems/types'

interface SpellState {
  spellId: string
  usesRemaining: number
}

interface Props {
  sessionId: number
  spells: SpellDefinition[]
  initialSpellState: SpellState[]
}

export default function SpellsPanel({ sessionId, spells, initialSpellState }: Props) {
  const [spellState, setSpellState] = useState<SpellState[]>(initialSpellState)

  if (!spells || spells.length === 0) return null

  function getUses(spellId: string): number {
    return spellState.find((s) => s.spellId === spellId)?.usesRemaining ?? 0
  }

  async function castSpell(spellId: string) {
    const current = getUses(spellId)
    if (current <= 0) return

    setSpellState((prev) =>
      prev.map((s) => (s.spellId === spellId ? { ...s, usesRemaining: s.usesRemaining - 1 } : s)),
    )

    const res = await fetch(`/api/sessions/${sessionId}/spells/${spellId}/cast`, {
      method: 'POST',
    })

    if (!res.ok) {
      setSpellState((prev) =>
        prev.map((s) => (s.spellId === spellId ? { ...s, usesRemaining: current } : s)),
      )
    } else {
      const updated = (await res.json()) as SpellState
      setSpellState((prev) => prev.map((s) => (s.spellId === spellId ? updated : s)))
    }
  }

  async function resetSpells() {
    const res = await fetch(`/api/sessions/${sessionId}/spells/reset`, {
      method: 'POST',
    })

    if (res.ok) {
      const updated = (await res.json()) as SpellState[]
      setSpellState(updated)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg text-header-accent border-l-4 border-header-accent pl-3">Spells</h2>
        <button
          onClick={() => void resetSpells()}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
          aria-label="Reset all spell uses to maximum"
        >
          Reset spells
        </button>
      </div>

      <table className="border-collapse w-full">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4 font-medium">Spell</th>
            <th className="py-2 pr-4 font-medium text-center">Uses</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {spells.map((spell) => {
            const uses = getUses(spell.id)
            const maxUses = spell.maxUses
            const exhausted = uses <= 0
            return (
              <tr key={spell.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <div className="font-medium">{spell.name}</div>
                  <div className="text-xs text-gray-500">
                    {spell.hitCondition} — {spell.damage} LP
                  </div>
                </td>
                <td className="py-2 pr-4 text-center font-mono text-sm">
                  <span className={exhausted ? 'text-red-600 font-semibold' : ''}>
                    {uses} / {maxUses}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => void castSpell(spell.id)}
                    disabled={exhausted}
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40"
                    aria-label={`Cast ${spell.name}`}
                  >
                    Cast
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
