'use client'

import { useState } from 'react'
import type { DiceSpec } from '../../../lib/game-systems/types'

interface Props {
  defaultDice: DiceSpec
}

function formatDiceExpr(dice: DiceSpec): string {
  const base = `${dice.count}d${dice.sides}`
  if (dice.modifier > 0) return `${base}+${dice.modifier}`
  if (dice.modifier < 0) return `${base}${dice.modifier}`
  return base
}

export default function DiceRoller({ defaultDice }: Props) {
  const [result, setResult] = useState<number | null>(null)
  const [rolling, setRolling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function roll() {
    setRolling(true)
    setError(null)
    try {
      const formula = formatDiceExpr(defaultDice)
      const response = await fetch('/api/dice/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula }),
      })
      if (!response.ok) {
        const data = await response.json() as { error?: string }
        setError(data.error ?? 'Roll failed')
        return
      }
      const data = await response.json() as { rolls: number[]; total: number }
      setResult(data.total)
    } catch {
      setError('Unable to reach dice server')
    } finally {
      setRolling(false)
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Dice Roller</h2>
      <div className="flex items-center gap-4">
        <button
          onClick={roll}
          disabled={rolling}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {rolling ? 'Rolling…' : `Roll ${formatDiceExpr(defaultDice)}`}
        </button>
        {result !== null && !error && (
          <span className="text-2xl font-mono font-bold">{result}</span>
        )}
        {error && (
          <span className="text-red-600 text-sm">{error}</span>
        )}
      </div>
    </section>
  )
}
