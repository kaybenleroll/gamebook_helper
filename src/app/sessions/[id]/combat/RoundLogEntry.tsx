import type { CombatRound } from './types'
import { RollBreakdown } from './RollBreakdown'
import { LuckResultsBreakdown } from './LuckResultsBreakdown'

interface RoundLogEntryProps {
  round: CombatRound
}

export function RoundLogEntry({ round }: RoundLogEntryProps) {
  const detail = round.detail as Record<string, unknown>
  const narrative =
    typeof detail['narrative'] === 'string'
      ? detail['narrative']
      : `Round ${round.roundNumber} — dealt ${round.damageDealt}, taken ${round.damageTaken}`
  return (
    <div className="text-sm border-b py-2 last:border-0">
      <div>
        <span className="font-semibold">Round {round.roundNumber}:</span>{' '}
        <span className="text-gray-700">{narrative}</span>
      </div>
      <RollBreakdown detail={detail} />
      <LuckResultsBreakdown luckResults={detail['luckResults']} />
    </div>
  )
}
