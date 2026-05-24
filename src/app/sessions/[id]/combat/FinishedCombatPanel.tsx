import type { CombatData } from './types'
import { RoundLog } from './RoundLog'

interface FinishedCombatPanelProps {
  combat: CombatData
  totalDamageDealt: number
  totalDamageTaken: number
  isGameOver: boolean
  onNewFight: () => void
}

export function FinishedCombatPanel({
  combat,
  totalDamageDealt,
  totalDamageTaken,
  isGameOver,
  onNewFight,
}: FinishedCombatPanelProps) {
  const startNarrative =
    typeof combat.metadata['startNarrative'] === 'string'
      ? (combat.metadata['startNarrative'] as string)
      : undefined

  return (
    <div className="border rounded p-4 max-w-xl">
      <div
        className={`mb-4 p-3 rounded text-center font-bold text-lg ${
          combat.outcome === 'player_won'
            ? 'bg-green-100 text-green-800'
            : combat.outcome === 'enemy_knocked_out'
              ? 'bg-amber-100 text-amber-800'
              : combat.outcome === 'player_fled'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
        }`}
      >
        {combat.outcome === 'player_won' && `Victory over ${combat.enemyName}!`}
        {combat.outcome === 'enemy_knocked_out' && `${combat.enemyName} knocked unconscious!`}
        {combat.outcome === 'player_lost' && `Defeated by ${combat.enemyName}.`}
        {combat.outcome === 'player_fled' && `Fled from ${combat.enemyName}.`}
      </div>

      {(combat.rounds.length > 0 || startNarrative) && (
        <div className="mb-4">
          <h4 className="font-semibold mb-2">Round log</h4>
          <RoundLog rounds={combat.rounds} startNarrative={startNarrative} />
        </div>
      )}

      {combat.rounds.length > 0 && (
        <div className="mb-4 text-sm text-gray-600 flex gap-6">
          <span>
            Damage dealt: <strong>{totalDamageDealt}</strong>
          </span>
          <span>
            Damage taken: <strong>{totalDamageTaken}</strong>
          </span>
        </div>
      )}

      {!isGameOver && (
        <button
          onClick={onNewFight}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Start new fight
        </button>
      )}
    </div>
  )
}
