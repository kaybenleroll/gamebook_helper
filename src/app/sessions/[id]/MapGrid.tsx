'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useOptimisticMutation } from '../../../lib/useOptimisticMutation'
import { useRouter, useSearchParams } from 'next/navigation'
import SvgCanvas, { type MapNode, type NodeBounds } from './map/SvgCanvas'
import NodeDetailPanel from './map/NodeDetailPanel'
import DirectionPicker, { type DirectionChoice } from './map/DirectionPicker'
import type { MapEdge } from './map/MapEdge'
import { computeConnectedNodePosition } from '../../../lib/mapPlacement'
import type { Direction } from '../../../lib/db/schema'

interface MapEntry {
  id: number
  sessionId: number
  name: string
  createdAt: string
}

interface Props {
  sessionId: number
}

const NODE_RADIUS = 18

function deriveNodeBounds(nodes: MapNode[]): NodeBounds[] {
  return nodes.map((n) => ({
    x: n.x - NODE_RADIUS,
    y: n.y - NODE_RADIUS,
    width: NODE_RADIUS * 2,
    height: NODE_RADIUS * 2,
  }))
}

export default function MapGrid({ sessionId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mapList, setMapList] = useState<MapEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Inline-rename state
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Node state for the active map
  const [nodes, setNodes] = useState<MapNode[]>([])

  // Edge state for the active map
  const [edges, setEdges] = useState<MapEdge[]>([])

  // Selection state — which node (by id) has the detail panel open
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)

  // Selection state — which edge has the detail panel open
  const [selectedEdge, setSelectedEdge] = useState<MapEdge | null>(null)

  // Pending placement — set when the direction picker should be shown
  const [pendingPlacement, setPendingPlacement] = useState<{ worldX: number; worldY: number } | null>(null)

  // Highlight a destination node briefly after cross-map navigation
  const [highlightNodeId, setHighlightNodeId] = useState<number | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cross-map link creation form state
  const [crossMapForm, setCrossMapForm] = useState<{
    destMapId: number | null
    destNodes: Array<{ id: number; sectionNumber: number | null }>
    destNodeId: number | null
    connectionType: string
  } | null>(null)

  const activeMapId = searchParams.get('mapId') ? parseInt(searchParams.get('mapId')!, 10) : null

  const fetchMaps = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/maps`)
      if (!res.ok) throw new Error('Failed to load maps')
      const data = (await res.json()) as MapEntry[]
      setMapList(data)
      setError(null)
    } catch {
      setError('Failed to load maps')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void fetchMaps()
  }, [fetchMaps])

  useEffect(() => {
    setSelectedNodeId(null)

    if (!activeMapId) {
      setNodes([])
      setEdges([])
      return
    }

    void (async () => {
      try {
        const [nodesRes, edgesRes] = await Promise.all([
          fetch(`/api/maps/${activeMapId}/nodes`),
          fetch(`/api/maps/${activeMapId}/edges`),
        ])
        if (nodesRes.ok) {
          setNodes((await nodesRes.json()) as MapNode[])
        } else {
          setNodes([])
        }
        if (edgesRes.ok) {
          setEdges((await edgesRes.json()) as MapEdge[])
        } else {
          setEdges([])
        }
      } catch {
        setNodes([])
        setEdges([])
      }
    })()
  }, [activeMapId])

  function setActiveMap(mapId: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mapId', String(mapId))
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  async function handleCreateMap() {
    const name = window.prompt('Map name:')
    if (!name || name.trim() === '') return

    try {
      const res = await fetch(`/api/sessions/${sessionId}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create map')
      const created = (await res.json()) as MapEntry
      setMapList((prev) => [...prev, created])
      setActiveMap(created.id)
    } catch {
      alert('Failed to create map. Please try again.')
    }
  }

  function startRename(map: MapEntry) {
    setRenamingId(map.id)
    setRenameValue(map.name)
  }

  async function commitRename(mapId: number) {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenamingId(null)
      return
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/maps/${mapId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('Failed to rename map')
      const updated = (await res.json()) as MapEntry
      setMapList((prev) => prev.map((m) => (m.id === mapId ? updated : m)))
    } catch {
      alert('Failed to rename map. Please try again.')
    } finally {
      setRenamingId(null)
    }
  }

  function confirmDelete(mapId: number) {
    setDeletingId(mapId)
  }

  async function executeDelete(mapId: number) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/maps/${mapId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete map')

      const remaining = mapList.filter((m) => m.id !== mapId)
      setMapList(remaining)

      // If the deleted map was active, switch to another or clear param
      if (activeMapId === mapId) {
        const params = new URLSearchParams(searchParams.toString())
        if (remaining.length > 0) {
          params.set('mapId', String(remaining[0].id))
        } else {
          params.delete('mapId')
        }
        router.replace(`?${params.toString()}`, { scroll: false })
      }
    } catch {
      alert('Failed to delete map. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleEdgeUpdate(edgeId: number, updates: { direction?: string | null; connectionType?: string }) {
    const previous = edges
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, ...updates } : e)))
    setSelectedEdge((prev) => (prev?.id === edgeId ? { ...prev, ...updates } : prev))
    try {
      const res = await fetch(`/api/maps/${activeMapId}/edges/${edgeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error('PATCH failed')
    } catch (err) {
      console.error('Failed to update edge:', err)
      setEdges(previous)
      setSelectedEdge((prev) => (prev?.id === edgeId ? previous.find((e) => e.id === edgeId) ?? null : prev))
    }
  }

  async function handleEdgeDelete(edgeId: number) {
    const previous = edges
    setEdges((prev) => prev.filter((e) => e.id !== edgeId))
    setSelectedEdge((prev) => (prev?.id === edgeId ? null : prev))
    try {
      const res = await fetch(`/api/maps/${activeMapId}/edges/${edgeId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('DELETE failed')
    } catch (err) {
      console.error('Failed to delete edge:', err)
      setEdges(previous)
    }
  }

  const mutateNodes = useOptimisticMutation(setNodes)

  async function handleNodeDragEnd(nodeId: number, x: number, y: number) {
    await mutateNodes(
      (prev) => prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
      async () => {
        const res = await fetch(`/api/maps/${activeMapId}/nodes/${nodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x, y }),
        })
        if (!res.ok) throw new Error('Failed to update node position')
      },
    )
  }

  const handleBackgroundClick = useCallback((worldX: number, worldY: number) => {
    setPendingPlacement({ worldX, worldY })
  }, [])

  const handleAddConnectedNodeFromPanel = useCallback(() => {
    // coords are ignored when parentNode exists; use (0,0) as sentinel
    setPendingPlacement({ worldX: 0, worldY: 0 })
  }, [])

  function handleDirectionCancel() {
    setPendingPlacement(null)
    setSelectedNodeId(null)
  }

  async function handleDirectionChosen({ direction, sectionNumber }: DirectionChoice) {
    const coords = pendingPlacement
    setPendingPlacement(null)

    if (!coords || !activeMapId) return

    const parentNode =
      selectedNodeId !== null ? nodes.find((n) => n.id === selectedNodeId) ?? null : null

    // If a section number was entered and a node with that number already exists,
    // only create an edge to the existing node — skip node creation entirely.
    const existingNode =
      sectionNumber != null
        ? nodes.find((n) => n.sectionNumber === sectionNumber)
        : undefined

    if (existingNode !== undefined && parentNode !== null && direction !== null) {
      const tempEdgeId = -Date.now()
      const optimisticEdge: MapEdge = {
        id: tempEdgeId,
        mapId: activeMapId,
        fromNodeId: parentNode.id,
        toNodeId: existingNode.id,
        targetMapId: null,
        direction,
        connectionType: 'open',
      }
      setEdges((prev) => [...prev, optimisticEdge])

      try {
        const edgeRes = await fetch(`/api/maps/${activeMapId}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromNodeId: parentNode.id,
            toNodeId: existingNode.id,
            direction,
            connectionType: 'open',
          }),
        })
        if (!edgeRes.ok) throw new Error('Failed to create edge')
        const createdEdge = (await edgeRes.json()) as MapEdge
        setEdges((prev) => prev.map((e) => (e.id === tempEdgeId ? createdEdge : e)))
        setSelectedNodeId(existingNode.id)
      } catch {
        setEdges((prev) => prev.filter((e) => e.id !== tempEdgeId))
      }
      return
    }

    let pos: { x: number; y: number }
    if (parentNode !== null && direction !== null) {
      pos = computeConnectedNodePosition(parentNode, direction, nodes)
    } else {
      pos = { x: coords.worldX, y: coords.worldY }
    }

    const tempNodeId = -Date.now()
    const tempEdgeId = -(Date.now() + 1)

    const optimisticNode: MapNode = {
      id: tempNodeId,
      mapId: activeMapId,
      sectionNumber: sectionNumber ?? null,
      locationType: 'room',
      locationTypeCustom: null,
      notes: null,
      visited: false,
      isCurrent: false,
      x: pos.x,
      y: pos.y,
    }

    const willCreateEdge = parentNode !== null && direction !== null
    const optimisticEdge: MapEdge | null = willCreateEdge
      ? {
          id: tempEdgeId,
          mapId: activeMapId,
          fromNodeId: parentNode!.id,
          toNodeId: tempNodeId,
          targetMapId: null,
          direction,
          connectionType: 'open',
        }
      : null

    setNodes((prev) => [...prev, optimisticNode])
    if (optimisticEdge) setEdges((prev) => [...prev, optimisticEdge])

    try {
      const nodeRes = await fetch(`/api/maps/${activeMapId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationType: 'room',
          x: pos.x,
          y: pos.y,
          ...(sectionNumber != null ? { sectionNumber } : {}),
        }),
      })
      if (!nodeRes.ok) throw new Error('Failed to create node')
      const createdNode = (await nodeRes.json()) as MapNode

      setNodes((prev) => prev.map((n) => (n.id === tempNodeId ? createdNode : n)))

      if (willCreateEdge) {
        const edgeRes = await fetch(`/api/maps/${activeMapId}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromNodeId: parentNode!.id,
            toNodeId: createdNode.id,
            direction,
            connectionType: 'open',
          }),
        })
        if (!edgeRes.ok) throw new Error('Failed to create edge')
        const createdEdge = (await edgeRes.json()) as MapEdge
        setEdges((prev) => prev.map((e) => (e.id === tempEdgeId ? createdEdge : e)))
      }

      setSelectedNodeId(createdNode.id)
    } catch {
      setNodes((prev) => prev.filter((n) => n.id !== tempNodeId))
      if (willCreateEdge) setEdges((prev) => prev.filter((e) => e.id !== tempEdgeId))
    }
  }

  if (loading) {
    return (
      <div className="p-4 border border-gray-200 rounded text-gray-400">
        Loading maps…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-200 rounded text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-panel-bg rounded-xl shadow-sm border border-panel-border p-4">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 gap-1 flex-wrap">
        {mapList.length === 0 ? (
          <span className="px-3 py-2 text-sm text-gray-400 italic">No maps yet</span>
        ) : (
          mapList.map((map) => {
            const isActive = map.id === activeMapId
            const isRenaming = renamingId === map.id
            const isDeleting = deletingId === map.id

            return (
              <div
                key={map.id}
                className={`flex items-center gap-1 px-3 py-2 text-sm border-b-2 cursor-pointer select-none ${
                  isActive
                    ? 'border-blue-600 text-blue-700 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
                onClick={() => {
                  if (!isRenaming) setActiveMap(map.id)
                }}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    className="border border-blue-400 rounded px-1 py-0 text-sm w-32 focus:outline-none"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename(map.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(map.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startRename(map)
                    }}
                    title="Double-click to rename"
                  >
                    {map.name}
                  </span>
                )}

                {/* Delete button */}
                {isDeleting ? (
                  <span
                    className="ml-1 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="text-red-600 hover:text-red-800 text-xs font-medium"
                      onClick={() => void executeDelete(map.id)}
                    >
                      Confirm
                    </button>
                    <button
                      className="text-gray-500 hover:text-gray-700 text-xs"
                      onClick={() => setDeletingId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="ml-1 text-gray-300 hover:text-red-500 text-xs leading-none"
                    title="Delete map"
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmDelete(map.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })
        )}

        {/* Add map button */}
        <button
          className="ml-1 px-2 py-1 text-sm text-gray-500 hover:text-blue-600 hover:bg-gray-50 rounded"
          title="New map"
          onClick={() => void handleCreateMap()}
        >
          +
        </button>
      </div>

      {/* Map content area */}
      {mapList.length === 0 ? (
        <div className="mt-4 p-6 border border-dashed border-gray-300 rounded text-center text-gray-400">
          <p className="mb-3">No maps yet for this adventure.</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            onClick={() => void handleCreateMap()}
          >
            Create first map
          </button>
        </div>
      ) : activeMapId ? (
        <div
          className="mt-4 border border-gray-200 rounded overflow-hidden flex relative flex-1 min-h-0"
        >
          <div className="flex-1 min-w-0">
            <SvgCanvas
              nodes={nodes}
              edges={edges}
              nodeBounds={deriveNodeBounds(nodes)}
              onBackgroundClick={handleBackgroundClick}
              onNodeDragEnd={(nodeId, x, y) => void handleNodeDragEnd(nodeId, x, y)}
              onNodeClick={(index) => {
                const node = nodes[index]
                if (node) {
                  setCrossMapForm(null)
                  setSelectedEdge(null)
                  setSelectedNodeId(node.id)
                }
              }}
              selectedEdgeId={selectedEdge?.id ?? null}
              onEdgeClick={(edge) => {
                if (edge.targetMapId != null) {
                  setActiveMap(edge.targetMapId)
                  if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
                  setHighlightNodeId(edge.toNodeId)
                  highlightTimerRef.current = setTimeout(() => setHighlightNodeId(null), 500)
                  return
                }
                setSelectedNodeId(null)
                setSelectedEdge(edge)
              }}
              mapList={mapList.map((m) => ({ id: m.id, name: m.name }))}
              highlightNodeId={highlightNodeId}
            />
          </div>

          {selectedNodeId !== null && (() => {
            const selectedNode = nodes.find((n) => n.id === selectedNodeId)
            if (!selectedNode) return null

            const crossMapFooter = (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                {crossMapForm === null ? (
                  <button
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
                    onClick={() => setCrossMapForm({ destMapId: null, destNodes: [], destNodeId: null, connectionType: 'open' })}
                  >
                    + Cross-map link
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Destination map</label>
                      <select
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={crossMapForm.destMapId ?? ''}
                        onChange={async (e) => {
                          const id = Number(e.target.value)
                          const res = await fetch(`/api/maps/${id}/nodes`)
                          const destNodes = res.ok ? (await res.json() as Array<{ id: number; sectionNumber: number | null }>) : []
                          setCrossMapForm((f) => f && ({ ...f, destMapId: id, destNodes, destNodeId: null }))
                        }}
                      >
                        <option value="">Select map…</option>
                        {mapList.filter((m) => m.id !== activeMapId).map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Destination node</label>
                      <select
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={crossMapForm.destNodeId ?? ''}
                        onChange={(e) => setCrossMapForm((f) => f && ({ ...f, destNodeId: Number(e.target.value) }))}
                        disabled={!crossMapForm.destMapId}
                      >
                        <option value="">Select node…</option>
                        {crossMapForm.destNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.sectionNumber != null ? `§${n.sectionNumber}` : `Node ${n.id}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                      <select
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={crossMapForm.connectionType}
                        onChange={(e) => setCrossMapForm((f) => f && ({ ...f, connectionType: e.target.value }))}
                      >
                        {['open', 'door', 'locked', 'secret', 'one_way', 'blocked'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!crossMapForm.destMapId || !crossMapForm.destNodeId}
                        onClick={async () => {
                          if (!crossMapForm.destMapId || !crossMapForm.destNodeId || !selectedNode) return
                          const res = await fetch(`/api/maps/${activeMapId}/edges`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              fromNodeId: selectedNode.id,
                              toNodeId: crossMapForm.destNodeId,
                              targetMapId: crossMapForm.destMapId,
                              connectionType: crossMapForm.connectionType,
                            }),
                          })
                          if (res.ok) {
                            const newEdge = (await res.json()) as MapEdge
                            setEdges((prev) => [...prev, newEdge])
                            setCrossMapForm(null)
                          }
                        }}
                      >
                        Create link
                      </button>
                      <button
                        className="flex-1 px-3 py-2 border border-gray-300 hover:bg-gray-50 text-sm rounded text-gray-600"
                        onClick={() => setCrossMapForm(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )

            return (
              <NodeDetailPanel
                key={selectedNodeId}
                node={selectedNode}
                mapId={activeMapId}
                onClose={() => {
                  setCrossMapForm(null)
                  setSelectedNodeId(null)
                }}
                onNodesChange={setNodes}
                onAddConnectedNode={handleAddConnectedNodeFromPanel}
                footer={crossMapFooter}
              />
            )
          })()}

          {selectedEdge !== null && (() => {
            const edge = edges.find((e) => e.id === selectedEdge.id) ?? selectedEdge
            return (
              <div className="w-72 border-l border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Edge</h3>
                  <button
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                    onClick={() => setSelectedEdge(null)}
                    aria-label="Close panel"
                  >
                    ×
                  </button>
                </div>

                <div className="px-4 py-3 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Connection type
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={edge.connectionType}
                      onChange={(e) => void handleEdgeUpdate(edge.id, { connectionType: e.target.value })}
                    >
                      <option value="open">Open</option>
                      <option value="door">Door</option>
                      <option value="locked">Locked</option>
                      <option value="secret">Secret</option>
                      <option value="one_way">One-way</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Direction
                    </label>
                    <select
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={edge.direction ?? ''}
                      onChange={(e) => void handleEdgeUpdate(edge.id, { direction: e.target.value || null })}
                    >
                      <option value="">None</option>
                      <option value="N">N</option>
                      <option value="S">S</option>
                      <option value="E">E</option>
                      <option value="W">W</option>
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>

                  <button
                    className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded font-medium transition-colors"
                    onClick={() => void handleEdgeDelete(edge.id)}
                  >
                    Delete edge
                  </button>
                </div>
              </div>
            )
          })()}

          {pendingPlacement !== null && (
            <DirectionPicker
              hasParent={selectedNodeId !== null}
              onSelect={(choice) => void handleDirectionChosen(choice)}
              onCancel={handleDirectionCancel}
            />
          )}
        </div>
      ) : (
        <div className="mt-4 p-4 border border-gray-200 rounded text-gray-500">
          Select a map tab above
        </div>
      )}
    </div>
  )
}
