'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface MapEntry {
  id: number
  sessionId: number
  name: string
  createdAt: string
}

interface Props {
  sessionId: number
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

  if (loading) {
    return (
      <div className="mt-6 p-4 border border-gray-200 rounded text-gray-400">
        Loading maps…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-6 p-4 border border-red-200 rounded text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="mt-6">
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
      ) : (
        <div className="mt-4 p-4 border border-gray-200 rounded text-gray-500">
          {activeMapId
            ? 'Map coming soon'
            : 'Select a map tab above'}
        </div>
      )}
    </div>
  )
}
