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

function rollDice(dice: DiceSpec): number {
  let total = 0
  for (let i = 0; i < dice.count; i++) {
    total += Math.floor(Math.random() * dice.sides) + 1
  }
  return total + dice.modifier
}

export default function DiceRoller({ defaultDice }: Props) {
  const [result, setResult] = useState<number | null>(null)

  function roll() {
    setResult(rollDice(defaultDice))
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Dice Roller</h2>
      <div className="flex items-center gap-4">
        <button
          onClick={roll}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Roll {formatDiceExpr(defaultDice)}
        </button>
        {result !== null && (
          <span className="text-2xl font-mono font-bold">{result}</span>
        )}
      </div>
    </section>
  )
}
