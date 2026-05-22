'use client'

import { useState } from 'react'
import type { StatDefinition } from '../../../lib/game-systems/types'

interface Props {
  sessionId: number
  stats: Record<string, number>
  initialStats: Record<string, number>
  statDefs: StatDefinition[]
}

export default function CharacterSheet({ sessionId, stats: initialCurrentStats, initialStats, statDefs }: Props) {
  const [currentStats, setCurrentStats] = useState(initialCurrentStats)

  async function adjust(stat: string, delta: number) {
    const res = await fetch(`/api/sessions/${sessionId}/character`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stat, delta }),
    })
    if (res.ok) {
      const data = await res.json() as { stats: Record<string, number> }
      setCurrentStats(data.stats)
    }
  }

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
            const current = currentStats[stat.key] ?? stat.min
            const atMin = current <= stat.min
            const atMax = stat.max !== undefined && current >= stat.max
            return (
              <tr key={stat.key} className="border-b last:border-0">
                <td className="py-2 pr-4">{stat.label}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => adjust(stat.key, -1)}
                      disabled={atMin}
                      className="w-7 h-7 rounded border font-bold disabled:opacity-40"
                      aria-label={`Decrease ${stat.label}`}
                    >
                      −
                    </button>
                    <span className="font-mono w-8 text-center">{current}</span>
                    <button
                      onClick={() => adjust(stat.key, +1)}
                      disabled={atMax}
                      className="w-7 h-7 rounded border font-bold disabled:opacity-40"
                      aria-label={`Increase ${stat.label}`}
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-2 text-right font-mono text-gray-500">
                  {initialStats[stat.key] ?? stat.min}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
