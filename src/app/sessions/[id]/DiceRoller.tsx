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

function DiceIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="16" height="16" rx="3" ry="3" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" />
      {/* dots for face showing 4 */}
      <circle cx="7"  cy="7"  r="1.5" />
      <circle cx="13" cy="7"  r="1.5" />
      <circle cx="7"  cy="13" r="1.5" />
      <circle cx="13" cy="13" r="1.5" />
    </svg>
  )
}

interface RollResult {
  rolls: number[]
  total: number
  modifier: number
}

function formatIndividualRolls(rolls: number[]): string | null {
  if (rolls.length <= 1) return null
  return `(${rolls.join(', ')})`
}

export default function DiceRoller({ defaultDice }: Props) {
  const [rollResult, setRollResult] = useState<RollResult | null>(null)
  const [rollCount, setRollCount] = useState(0)
  const [rolling, setRolling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function roll(formula: string, modifier: number) {
    setRolling(formula)
    setError(null)
    try {
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
      setRollResult({ rolls: data.rolls, total: data.total, modifier })
      setRollCount(c => c + 1)
    } catch {
      setError('Unable to reach dice server')
    } finally {
      setRolling(null)
    }
  }

  const defaultFormula = formatDiceExpr(defaultDice)
  const individualRolls = rollResult !== null
    ? formatIndividualRolls(rollResult.rolls)
    : null

  return (
    <section className="mt-6 bg-panel-bg rounded-xl shadow-sm border border-panel-border p-4">
      <h2 className="font-heading text-lg text-header-accent border-l-4 border-header-accent pl-3 mb-3">Dice Roller</h2>
      <div className="flex items-center gap-4">
        <button
          onClick={() => roll('1d6', 0)}
          disabled={rolling !== null}
          className="bg-header-accent hover:opacity-90 active:scale-95 transition-transform text-white font-heading text-lg px-6 py-2 rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <DiceIcon />
          {rolling === '1d6' ? 'Rolling…' : 'Roll 1d6'}
        </button>
        <button
          onClick={() => roll(defaultFormula, defaultDice.modifier)}
          disabled={rolling !== null}
          className="bg-header-accent hover:opacity-90 active:scale-95 transition-transform text-white font-heading text-lg px-6 py-2 rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <DiceIcon />
          {rolling === defaultFormula ? 'Rolling…' : `Roll ${defaultFormula}`}
        </button>
        {rollResult !== null && !error && (
          <div key={rollCount} className="flex-1 flex items-center justify-center gap-3 animate-fade-in">
            {individualRolls !== null && (
              <span className="font-mono text-accent-blue text-lg opacity-60">{individualRolls}</span>
            )}
            <span className="font-mono text-accent-blue text-4xl font-bold">{rollResult.total}</span>
          </div>
        )}
        {error && (
          <span className="text-red-600 text-sm">{error}</span>
        )}
      </div>
    </section>
  )
}
