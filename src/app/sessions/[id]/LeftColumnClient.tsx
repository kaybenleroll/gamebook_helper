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
import SessionClient from './SessionClient'
import DiceRoller from './DiceRoller'
import SectionTracker from './SectionTracker'
import InventoryPanel from './InventoryPanel'
import Notes from './Notes'
import type { StatDefinition, CombatModule, DiceSpec } from '../../../lib/game-systems/types'
import type { CreationRolls } from '../../../lib/db/schema'

export const PANEL_IDS = [
  'character-sheet',
  'dice-roller',
  'section-tracker',
  'inventory',
  'notes',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

const PANEL_SPANS: Record<PanelId, 1 | 2> = {
  'character-sheet': 2,
  'dice-roller': 1,
  'section-tracker': 1,
  inventory: 2,
  notes: 2,
}

function isValidPanelOrder(order: unknown): order is PanelId[] {
  if (!Array.isArray(order)) return false
  const validIds = new Set<string>(PANEL_IDS)
  return (
    order.length === PANEL_IDS.length &&
    order.every((item) => typeof item === 'string' && validIds.has(item)) &&
    new Set(order).size === PANEL_IDS.length
  )
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
      className={`group relative ${span === 2 ? 'col-span-2' : 'col-span-1'}`}
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
  createdAt: string
}

interface SectionEntry {
  sectionNumber: number
  visitedAt: string
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
  creationRolls: CreationRolls | null
  defaultDice: DiceSpec
  initialCurrentSection: number | null
  initialHistory: SectionEntry[]
  initialItems: InventoryItem[]
  initialNotes: string | null
}

export default function LeftColumnClient({
  sessionId,
  savedPanelOrder,
  stats,
  initialStats,
  statDefs,
  gameSystemId,
  isGameOver,
  initialCombat,
  enemyStatFields,
  primaryHealthStat,
  primaryEnemyHealthStat,
  creationRolls,
  defaultDice,
  initialCurrentSection,
  initialHistory,
  initialItems,
  initialNotes,
}: LeftColumnProps) {
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
    isValidPanelOrder(parsed) ? parsed : [...PANEL_IDS],
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
    'character-sheet': (
      <SessionClient
        sessionId={sessionId}
        stats={stats}
        initialStats={initialStats}
        statDefs={statDefs}
        gameSystemId={gameSystemId}
        isGameOver={isGameOver}
        initialCombat={initialCombat}
        enemyStatFields={enemyStatFields}
        primaryHealthStat={primaryHealthStat}
        primaryEnemyHealthStat={primaryEnemyHealthStat}
        creationRolls={creationRolls}
      />
    ),
    'dice-roller': <DiceRoller defaultDice={defaultDice} />,
    'section-tracker': (
      <SectionTracker
        sessionId={sessionId}
        initialCurrentSection={initialCurrentSection}
        initialHistory={initialHistory}
      />
    ),
    inventory: (
      <InventoryPanel
        sessionId={sessionId}
        gameSystemId={gameSystemId}
        initialItems={initialItems}
      />
    ),
    notes: <Notes sessionId={sessionId} initialNotes={initialNotes} />,
  }

  return (
    <DndContext
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
  )
}
