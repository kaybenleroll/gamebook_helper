'use client'

import React, { useEffect, useState } from 'react'
import { LOCATION_TYPE_PRESETS } from '../../../../lib/db/schema'
import { useOptimisticMutation } from '../../../../lib/useOptimisticMutation'
import type { MapNode } from './SvgCanvas'

interface NodeDetailPanelProps {
  node: MapNode
  onClose: () => void
  onNodesChange: React.Dispatch<React.SetStateAction<MapNode[]>>
  mapId: number
  onAddConnectedNode?: () => void
}

function isPreset(value: string): boolean {
  return (LOCATION_TYPE_PRESETS as readonly string[]).includes(value)
}

export default function NodeDetailPanel({
  node,
  onClose,
  onNodesChange,
  mapId,
  onAddConnectedNode,
}: NodeDetailPanelProps) {
  const mutate = useOptimisticMutation(onNodesChange)

  const locationIsCustom = !isPreset(node.locationType)
  const [showCustomInput, setShowCustomInput] = useState(locationIsCustom)

  const selectValue = locationIsCustom ? '__custom__' : node.locationType

  useEffect(() => {
    setShowCustomInput(!isPreset(node.locationType))
  }, [node.locationType])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function patchNode(fields: Partial<Omit<MapNode, 'id' | 'mapId' | 'x' | 'y'>>) {
    await mutate(
      (prev: MapNode[]) => prev.map((n) => (n.id === node.id ? { ...n, ...fields } : n)),
      async () => {
        const res = await fetch(`/api/maps/${mapId}/nodes/${node.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        })
        if (!res.ok) throw new Error('PATCH failed')
      },
    )
  }

  async function handleSetCurrent() {
    const res = await fetch(`/api/maps/${mapId}/nodes/${node.id}/set-current`, {
      method: 'POST',
    })
    if (!res.ok) return
    const updated = (await res.json()) as MapNode[]
    onNodesChange(() => updated)
  }

  function handleLocationTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    if (value === '__custom__') {
      setShowCustomInput(true)
      return
    }
    setShowCustomInput(false)
    void patchNode({ locationType: value, locationTypeCustom: null })
  }

  return (
    <div className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">Node details</h3>
        <button
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          onClick={onClose}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Section number */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Section number
          </label>
          <input
            type="number"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            defaultValue={node.sectionNumber ?? ''}
            onBlur={(e) => {
              const raw = e.target.value.trim()
              const val = raw === '' ? null : parseInt(raw, 10)
              const current = node.sectionNumber ?? null
              if (val === current) return
              if (raw !== '' && (isNaN(val!) || val! <= 0)) return
              void patchNode({ sectionNumber: val })
            }}
          />
        </div>

        {/* Location type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Location type
          </label>
          <select
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={selectValue}
            onChange={handleLocationTypeChange}
          >
            {LOCATION_TYPE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>

          {showCustomInput && (
            <input
              type="text"
              className="mt-1.5 w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Enter custom type"
              defaultValue={node.locationTypeCustom ?? ''}
              onBlur={(e) => {
                const val = e.target.value.trim()
                if (!val) return
                void patchNode({
                  locationType: val,
                  locationTypeCustom: val,
                })
              }}
            />
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Notes
          </label>
          <textarea
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            rows={4}
            defaultValue={node.notes ?? ''}
            onBlur={(e) => {
              const val = e.target.value
              const current = node.notes ?? ''
              if (val === current) return
              void patchNode({ notes: val || null })
            }}
          />
        </div>

        {/* Visited toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`visited-${node.id}`}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            checked={node.visited}
            onChange={(e) => {
              void patchNode({ visited: e.target.checked })
            }}
          />
          <label
            htmlFor={`visited-${node.id}`}
            className="text-sm text-gray-700 cursor-pointer"
          >
            Visited
          </label>
        </div>

        {/* Set as current location */}
        <button
          className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded font-medium transition-colors"
          onClick={() => void handleSetCurrent()}
        >
          Set as current location
        </button>

        {onAddConnectedNode && (
          <button
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
            onClick={onAddConnectedNode}
          >
            Add connected node
          </button>
        )}
      </div>
    </div>
  )
}
