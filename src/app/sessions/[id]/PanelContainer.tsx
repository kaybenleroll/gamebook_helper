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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const PANEL_IDS = [
  'character-sheet',
  'combat',
  'dice-roller',
  'section-tracker',
  'inventory',
  'notes',
] as const

export type PanelId = (typeof PANEL_IDS)[number]

interface SortableItemProps {
  id: PanelId
  children: React.ReactNode
}

function SortableItem({ id, children }: SortableItemProps) {
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
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1 z-10 hidden group-hover:flex items-center justify-center w-6 h-6 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none"
        aria-label="Drag to reorder panel"
        type="button"
      >
        ≡
      </button>
      <div className="pl-7">
        {children}
      </div>
    </div>
  )
}

export interface PanelEntry {
  id: PanelId
  node: React.ReactNode
}

interface Props {
  sessionId: number
  initialOrder: PanelId[]
  panels: PanelEntry[]
}

export default function PanelContainer({ sessionId, initialOrder, panels }: Props) {
  const [order, setOrder] = useState<PanelId[]>(initialOrder)

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

  const panelMap = new Map(panels.map((p) => [p.id, p.node]))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {order.map((id) => {
            const node = panelMap.get(id)
            if (!node) return null
            return (
              <SortableItem key={id} id={id}>
                {node}
              </SortableItem>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
