'use client'

import { useEffect, useState, useCallback } from 'react'

// Cell style definitions — mirrors schema but kept local to avoid importing server-side drizzle code
const CELL_STYLE_CYCLE = ['unknown', 'enclosed', 'open', 'path', 'water', 'barrier'] as const
type CellStyleLocal = (typeof CELL_STYLE_CYCLE)[number]

const NEXT_STYLE: Record<CellStyleLocal, CellStyleLocal> = {
  unknown: 'enclosed',
  enclosed: 'open',
  open: 'path',
  path: 'water',
  water: 'barrier',
  barrier: 'unknown',
}

const CELL_CLASSES: Record<CellStyleLocal, string> = {
  unknown:  'bg-gray-100',
  enclosed: 'bg-amber-100',
  open:     'bg-white',
  path:     'bg-gray-300',
  water:    'bg-blue-200',
  barrier:  'bg-gray-800',
}

interface CellData {
  cellStyle: CellStyleLocal
  sectionNumber?: number | null
  label?: string | null
  notes?: string | null
}

interface MapState {
  width: number
  height: number
  cells: Map<string, CellData>
}

interface Props {
  sessionId: number
}

export default function MapGrid({ sessionId }: Props) {
  const [mapState, setMapState] = useState<MapState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/map`)
      .then((r) => r.json())
      .then((data: { width: number; height: number; cells: Array<{ x: number; y: number; cellStyle: string; sectionNumber?: number | null; label?: string | null; notes?: string | null }> }) => {
        const cells = new Map<string, CellData>()
        for (const c of data.cells) {
          cells.set(`${c.x},${c.y}`, {
            cellStyle: (CELL_STYLE_CYCLE.includes(c.cellStyle as CellStyleLocal) ? c.cellStyle : 'unknown') as CellStyleLocal,
            sectionNumber: c.sectionNumber,
            label: c.label,
            notes: c.notes,
          })
        }
        setMapState({ width: data.width, height: data.height, cells })
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load map')
        setLoading(false)
      })
  }, [sessionId])

  const handleCellClick = useCallback(async (x: number, y: number) => {
    if (!mapState) return
    const key = `${x},${y}`
    const current = mapState.cells.get(key)?.cellStyle ?? 'unknown'
    const next = NEXT_STYLE[current]

    // Optimistic update
    setMapState((prev) => {
      if (!prev) return prev
      const newCells = new Map(prev.cells)
      newCells.set(key, { ...prev.cells.get(key), cellStyle: next })
      return { ...prev, cells: newCells }
    })

    try {
      await fetch(`/api/sessions/${sessionId}/map/cells`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, cellStyle: next }),
      })
    } catch {
      // Revert on failure
      setMapState((prev) => {
        if (!prev) return prev
        const newCells = new Map(prev.cells)
        newCells.set(key, { ...prev.cells.get(key), cellStyle: current })
        return { ...prev, cells: newCells }
      })
    }
  }, [mapState, sessionId])

  if (loading) return <p className="mt-6 text-gray-500">Loading map…</p>
  if (error) return <p className="mt-6 text-red-500">{error}</p>
  if (!mapState) return null

  const { width, height, cells } = mapState

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Map</h2>

      {/* Compass */}
      <div className="mb-1 flex flex-col items-start">
        <span className="text-xs text-gray-500 font-mono">N ↑</span>
        <span className="text-xs text-gray-500 font-mono">W ← &nbsp;&nbsp; → E</span>
        <span className="text-xs text-gray-500 font-mono">S ↓</span>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {CELL_STYLE_CYCLE.map((style) => (
          <span key={style} className={`px-2 py-0.5 rounded border border-gray-300 ${CELL_CLASSES[style]} ${style === 'barrier' ? 'text-white' : ''}`}>
            {style}
          </span>
        ))}
      </div>

      {/* Grid — scrollable */}
      <div className="overflow-auto max-h-[60vh] max-w-full">
        {/* Use gap-px + background colour trick for clean 1px grid lines */}
        <div
          className="inline-grid bg-gray-400 gap-px border border-gray-400"
          style={{
            gridTemplateColumns: `repeat(${width}, 28px)`,
            gridTemplateRows: `repeat(${height}, 28px)`,
          }}
        >
          {Array.from({ length: height }, (_, y) =>
            Array.from({ length: width }, (_, x) => {
              const key = `${x},${y}`
              const cell = cells.get(key)
              const style = cell?.cellStyle ?? 'unknown'
              return (
                <button
                  key={key}
                  className={`w-full h-full ${CELL_CLASSES[style]} hover:opacity-80 transition-opacity`}
                  onClick={() => handleCellClick(x, y)}
                  title={`(${x},${y}) ${style}`}
                  aria-label={`Cell ${x},${y}: ${style}`}
                />
              )
            })
          ).flat()}
        </div>
      </div>
    </section>
  )
}
