'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CombatPanel from './CombatPanel'
import DiceRoller from './DiceRoller'
import Notes from './Notes'
import TabbedStatsPanel from './TabbedStatsPanel'
import type { StatDefinition, CombatModule, DiceSpec, SpellDefinition } from '../../../lib/game-systems/types'
import type { CreationRolls } from '../../../lib/db/schema'

export const PANEL_IDS = [
  'tabbed-stats',
  'dice-roller',
  'notes',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

const PANEL_SPANS: Record<PanelId, 1 | 2> = {
  'tabbed-stats': 2,
  'dice-roller': 2,
  notes: 2,
}

function isValidPanelOrder(order: unknown): order is PanelId[] {
  if (!Array.isArray(order)) return false
  const validIds = new Set<string>(PANEL_IDS)
  if (!order.every((item) => typeof item === 'string' && validIds.has(item))) return false
  if (new Set(order).size !== order.length) return false
  return true
}

function normalisePanelOrder(order: PanelId[]): PanelId[] {
  const missing = PANEL_IDS.filter((id) => !order.includes(id))
  return missing.length > 0 ? [...order, ...missing] : order
}

interface SortableItemProps {
  id: PanelId
  span: 1 | 2
  children: React.ReactNode
}

function SortableItem({ id, span, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative min-w-0 overflow-hidden ${span === 2 ? 'col-span-2' : 'col-span-1'}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-2 z-10 flex items-center justify-center w-5 h-5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none transition-opacity"
        aria-label="Drag to reorder panel"
        type="button"
      >
        ≡
      </button>
      <div className="pl-6">
        {children}
      </div>
    </div>
  )
}

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

export interface LeftColumnProps {
  sessionId: number
  savedPanelOrder: string | null
  stats: Record<string, unknown>
  initialStats: Record<string, unknown>
  statDefs: StatDefinition[]
  gameSystemId: string
  isGameOver: boolean
  initialCombat: CombatData | null
  enemyStatFields: CombatModule['enemyStatFields'] | null
  primaryHealthStat: string
  primaryEnemyHealthStat: string
  hasTestLuck: boolean
  hasEquipment: boolean
  hasGold: boolean
  hasCodewords: boolean
  backpackLimit?: number
  experienceStatKey?: string
  creationRolls: CreationRolls | null
  defaultDice: DiceSpec
  initialItems: InventoryItem[]
  initialNotes: string | null
  spellDefinitions: SpellDefinition[]
  initialSpellState: SpellState[]
  initialMetadata: Record<string, unknown>
}

export default function LeftColumnClient({
  sessionId,
  savedPanelOrder,
  stats: initialStatsProp,
  initialStats: initialInitialStats,
  statDefs,
  gameSystemId,
  isGameOver,
  initialCombat,
  enemyStatFields,
  primaryHealthStat,
  primaryEnemyHealthStat,
  hasTestLuck,
  hasEquipment,
  hasGold,
  hasCodewords,
  backpackLimit,
  experienceStatKey,
  creationRolls,
  defaultDice,
  initialItems,
  initialNotes,
  spellDefinitions,
  initialSpellState,
  initialMetadata,
}: LeftColumnProps) {
  // Shared character stats — both TabbedStatsPanel and CombatPanel read/write these
  const [currentStats, setCurrentStats] = useState(initialStatsProp)
  const [currentInitialStats, setCurrentInitialStats] = useState(initialInitialStats)
  const [sessionMetadata, setSessionMetadata] = useState(initialMetadata)

  function handleStatsChange(
    newStats: Record<string, unknown>,
    newInitialStats: Record<string, unknown>,
  ) {
    setCurrentStats(newStats)
    setCurrentInitialStats(newInitialStats)
  }

  const [combatOpen, setCombatOpen] = useState(false)

  const parsed = savedPanelOrder
    ? (() => {
        try {
          return JSON.parse(savedPanelOrder) as unknown
        } catch {
          return null
        }
      })()
    : null

  const [order, setOrder] = useState<PanelId[]>(
    isValidPanelOrder(parsed) ? normalisePanelOrder(parsed) : [...PANEL_IDS],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as PanelId)
        const newIndex = prev.indexOf(over.id as PanelId)
        const next = arrayMove(prev, oldIndex, newIndex)

        fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ panelOrder: next }),
        }).catch(() => {})

        return next
      })
    },
    [sessionId],
  )

  const panelNodes: Record<PanelId, React.ReactNode> = {
    'tabbed-stats': (
      <TabbedStatsPanel
        sessionId={sessionId}
        stats={currentStats}
        initialStats={currentInitialStats}
        statDefs={statDefs}
        gameSystemId={gameSystemId}
        isGameOver={isGameOver}
        primaryHealthStat={primaryHealthStat}
        hasEquipment={hasEquipment}
        hasTestLuck={hasTestLuck}
        hasGold={hasGold}
        hasCodewords={hasCodewords}
        backpackLimit={backpackLimit}
        experienceStatKey={experienceStatKey}
        creationRolls={creationRolls}
        onStatsChange={handleStatsChange}
        initialItems={initialItems}
        spellDefinitions={spellDefinitions}
        initialSpellState={initialSpellState}
        metadata={sessionMetadata}
        onMetadataChange={setSessionMetadata}
      />
    ),
    'dice-roller': <DiceRoller defaultDice={defaultDice} />,
    notes: <Notes sessionId={sessionId} initialNotes={initialNotes} />,
  }

  return (
    <div>
      {enemyStatFields && !isGameOver && (
        <div className="mb-4">
          <button
            onClick={() => setCombatOpen(true)}
            className="w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
            type="button"
          >
            Start Combat
          </button>
        </div>
      )}

      <DndContext
        id="panel-sort"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4">
            {order.map((id) => (
              <SortableItem key={id} id={id} span={PANEL_SPANS[id]}>
                {panelNodes[id]}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {combatOpen && enemyStatFields && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setCombatOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Close combat"
              type="button"
            >✕</button>
            <CombatPanel
              sessionId={sessionId}
              initialCombat={initialCombat}
              enemyStatFields={enemyStatFields}
              characterStats={currentStats}
              initialStats={currentInitialStats}
              isGameOver={isGameOver}
              onStatsChange={handleStatsChange}
              primaryHealthStat={primaryHealthStat}
              primaryEnemyHealthStat={primaryEnemyHealthStat}
              hasTestLuck={hasTestLuck}
              onCombatEnd={() => setCombatOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
