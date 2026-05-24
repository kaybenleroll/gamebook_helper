'use client'

import type { StatDefinition } from '../../../lib/game-systems/types'
import type { CreationRolls } from '../../../lib/db/schema'
import CharacterSheet from './CharacterSheet'
import CreationRollsModal from './CreationRollsModal'

interface Props {
  sessionId: number
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
  statDefs: StatDefinition[]
  gameSystemId: string
  isGameOver: boolean
  primaryHealthStat: string
  creationRolls: CreationRolls | null
  onCreationRollsDismiss: () => void
  onStatsChange: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
  metadata?: Record<string, unknown>
  onMetadataChange?: (metadata: Record<string, unknown>) => void
}

/**
 * Thin client wrapper for CharacterSheet and CreationRollsModal.
 * Shared stats state lives in LeftColumnClient so CombatPanel can
 * read and update the same values without a full page refresh.
 * creationRolls is controlled by TabbedStatsPanel so dismissal
 * survives tab switches without remounting this component.
 */
export default function SessionClient({
  sessionId,
  stats,
  initialStats,
  statDefs,
  gameSystemId,
  isGameOver,
  primaryHealthStat,
  creationRolls,
  onCreationRollsDismiss,
  onStatsChange,
  metadata,
  onMetadataChange,
}: Props) {
  return (
    <>
      {creationRolls && (
        <CreationRollsModal
          sessionId={sessionId}
          creationRolls={creationRolls}
          onDismiss={onCreationRollsDismiss}
        />
      )}
      <CharacterSheet
        sessionId={sessionId}
        stats={stats}
        initialStats={initialStats}
        statDefs={statDefs}
        gameSystemId={gameSystemId}
        primaryHealthStat={primaryHealthStat}
        isGameOver={isGameOver}
        onStatsChange={onStatsChange}
        metadata={metadata}
        onMetadataChange={onMetadataChange}
      />
    </>
  )
}
