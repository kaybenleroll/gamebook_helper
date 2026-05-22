'use client'

import { useState } from 'react'
import type { StatDefinition, CombatModule } from '../../../lib/game-systems/types'
import type { CreationRolls } from '../../../lib/db/schema'
import CharacterSheet from './CharacterSheet'
import CombatPanel from './CombatPanel'
import CreationRollsModal from './CreationRollsModal'

interface CombatRound {
  id: number
  roundNumber: number
  detail: Record<string, unknown>
  damageDealt: number
  damageTaken: number
  createdAt: string
}

interface CombatData {
  id: number
  sessionId: number
  enemyName: string
  enemyStats: Record<string, unknown>
  enemyState: Record<string, unknown>
  metadata: Record<string, unknown>
  outcome: string
  startedAt: string
  endedAt: string | null
  availableRoundOptions?: import('../../../lib/game-systems/types').RoundOption[]
  rounds: CombatRound[]
}

interface Props {
  sessionId: number
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
  statDefs: StatDefinition[]
  gameSystemId: string
  isGameOver: boolean
  initialCombat: CombatData | null
  enemyStatFields: CombatModule['enemyStatFields'] | null
  primaryHealthStat: string
  primaryEnemyHealthStat: string
  creationRolls: CreationRolls | null
}

/**
 * Thin client wrapper that lifts shared character stats so both
 * CharacterSheet and CombatPanel can read and update the same state
 * without a full page refresh after each combat round.
 */
export default function SessionClient({
  sessionId,
  stats: initialStatsProp,
  initialStats: initialInitialStats,
  statDefs,
  gameSystemId,
  isGameOver,
  initialCombat,
  enemyStatFields,
  primaryHealthStat,
  primaryEnemyHealthStat,
  creationRolls: initialCreationRolls,
}: Props) {
  const [stats, setStats] = useState(initialStatsProp)
  const [currentInitialStats, setCurrentInitialStats] = useState(initialInitialStats)
  const [creationRolls, setCreationRolls] = useState<CreationRolls | null>(initialCreationRolls)

  function handleStatsChange(
    newStats: Record<string, unknown>,
    newInitialStats: Record<string, unknown>,
  ) {
    setStats(newStats)
    setCurrentInitialStats(newInitialStats)
  }

  return (
    <>
      {creationRolls && (
        <CreationRollsModal
          sessionId={sessionId}
          creationRolls={creationRolls}
          onDismiss={() => setCreationRolls(null)}
        />
      )}
      <CharacterSheet
        sessionId={sessionId}
        stats={stats}
        initialStats={currentInitialStats}
        statDefs={statDefs}
        gameSystemId={gameSystemId}
        isGameOver={isGameOver}
        onStatsChange={handleStatsChange}
      />
      {enemyStatFields && (
        <CombatPanel
          sessionId={sessionId}
          initialCombat={initialCombat}
          enemyStatFields={enemyStatFields}
          characterStats={stats}
          initialStats={currentInitialStats}
          isGameOver={isGameOver}
          onStatsChange={handleStatsChange}
          primaryHealthStat={primaryHealthStat}
          primaryEnemyHealthStat={primaryEnemyHealthStat}
        />
      )}
    </>
  )
}
