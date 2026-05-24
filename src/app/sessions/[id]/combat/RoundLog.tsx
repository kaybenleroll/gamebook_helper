import type { CombatRound } from './types'
import { RoundLogEntry } from './RoundLogEntry'

interface RoundLogProps {
  rounds: CombatRound[]
  startNarrative?: string
}

export function RoundLog({ rounds, startNarrative }: RoundLogProps) {
  if (rounds.length === 0 && !startNarrative) return null
  return (
    <div className="border rounded divide-y text-sm max-h-48 overflow-y-auto">
      {startNarrative && (
        <div className="text-sm border-b py-2 last:border-0">
          <span className="font-semibold text-gray-500">Start:</span>{' '}
          <span className="text-gray-600 italic">{startNarrative}</span>
        </div>
      )}
      {rounds.map((r) => (
        <RoundLogEntry key={r.id} round={r} />
      ))}
    </div>
  )
}
