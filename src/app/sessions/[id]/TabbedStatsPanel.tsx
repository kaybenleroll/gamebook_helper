'use client'

import { useState } from 'react'
import SessionClient from './SessionClient'
import InventoryPanel from './InventoryPanel'
import SpellsPanel from './SpellsPanel'
import type { StatDefinition, SpellDefinition } from '../../../lib/game-systems/types'
import type { CreationRolls } from '../../../lib/db/schema'

type Tab = 'stats' | 'inventory' | 'spells'

interface InventoryItem {
  id: number
  sessionId: number
  name: string
  quantity: number
  isSpecial: boolean
  itemType: string
  doseCount: number | null
  healAmount: number | null
  healDice: string | null
  createdAt: string
}

interface SpellState {
  spellId: string
  usesRemaining: number
}

interface Props {
  // SessionClient / CharacterSheet props
  sessionId: number
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
  statDefs: StatDefinition[]
  gameSystemId: string
  isGameOver: boolean
  primaryHealthStat: string
  creationRolls: CreationRolls | null
  onStatsChange: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
  // InventoryPanel props
  initialItems: InventoryItem[]
  // SpellsPanel props
  spellDefinitions: SpellDefinition[]
  initialSpellState: SpellState[]
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'stats', label: 'Stats' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'spells', label: 'Spells' },
]

export default function TabbedStatsPanel({
  sessionId,
  stats,
  initialStats,
  statDefs,
  gameSystemId,
  isGameOver,
  primaryHealthStat,
  creationRolls: initialCreationRolls,
  onStatsChange,
  initialItems,
  spellDefinitions,
  initialSpellState,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [creationRolls, setCreationRolls] = useState<CreationRolls | null>(initialCreationRolls)

  const hasSpells = spellDefinitions && spellDefinitions.length > 0

  return (
    <div className="bg-panel-bg rounded-xl shadow-sm border border-panel-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-panel-border">
        {TABS.map((tab) => {
          if (tab.id === 'spells' && !hasSpells) return null
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              className={
                isActive
                  ? 'px-4 py-2 text-sm font-heading text-header-accent border-b-2 border-header-accent -mb-px bg-transparent'
                  : 'px-4 py-2 text-sm text-text-muted hover:text-text-primary bg-transparent'
              }
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'stats' && (
          <SessionClient
            sessionId={sessionId}
            stats={stats}
            initialStats={initialStats}
            statDefs={statDefs}
            gameSystemId={gameSystemId}
            isGameOver={isGameOver}
            primaryHealthStat={primaryHealthStat}
            creationRolls={creationRolls}
            onCreationRollsDismiss={() => setCreationRolls(null)}
            onStatsChange={onStatsChange}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryPanel
            sessionId={sessionId}
            gameSystemId={gameSystemId}
            initialItems={initialItems}
          />
        )}
        {activeTab === 'spells' && hasSpells && (
          <SpellsPanel
            sessionId={sessionId}
            spells={spellDefinitions}
            initialSpellState={initialSpellState}
          />
        )}
      </div>
    </div>
  )
}
