'use client'

import { useState } from 'react'
import type { StatDefinition } from '../../../lib/game-systems/types'
import type { CombatModule } from '../../../lib/game-systems/types'
import CharacterSheet from './CharacterSheet'
import CombatPanel from './CombatPanel'

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
  combatModule: CombatModule | null
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
  combatModule,
}: Props) {
  const [stats, setStats] = useState(initialStatsProp)
  const [currentInitialStats, setCurrentInitialStats] = useState(initialInitialStats)

  function handleStatsChange(
    newStats: Record<string, unknown>,
    newInitialStats: Record<string, unknown>,
  ) {
    setStats(newStats)
    setCurrentInitialStats(newInitialStats)
  }

  return (
    <>
      <CharacterSheet
        sessionId={sessionId}
        stats={stats}
        initialStats={currentInitialStats}
        statDefs={statDefs}
        gameSystemId={gameSystemId}
        isGameOver={isGameOver}
        onStatsChange={handleStatsChange}
      />
      {combatModule && (
        <CombatPanel
          sessionId={sessionId}
          initialCombat={initialCombat}
          combatModule={combatModule}
          characterStats={stats}
          initialStats={currentInitialStats}
          isGameOver={isGameOver}
          onStatsChange={handleStatsChange}
        />
      )}
    </>
  )
}
