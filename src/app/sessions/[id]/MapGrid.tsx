'use client'

import { useEffect, useState, useCallback } from 'react'

const CELL_STYLE_CYCLE = ['unknown', 'enclosed', 'open', 'path', 'water', 'barrier'] as const
type CellStyleLocal = (typeof CELL_STYLE_CYCLE)[number]

const PASSAGE_TYPE_CYCLE = ['open', 'door', 'secret', 'locked', 'one_way', 'blocked'] as const
type PassageTypeLocal = (typeof PASSAGE_TYPE_CYCLE)[number]

const NEXT_CELL_STYLE: Record<CellStyleLocal, CellStyleLocal> = {
  unknown: 'enclosed', enclosed: 'open', open: 'path',
  path: 'water', water: 'barrier', barrier: 'unknown',
}

const NEXT_PASSAGE: Record<PassageTypeLocal | 'none', PassageTypeLocal | 'none'> = {
  none: 'open', open: 'door', door: 'secret',
  secret: 'locked', locked: 'one_way', one_way: 'blocked', blocked: 'none',
}

const CELL_CLASSES: Record<CellStyleLocal, string> = {
  unknown:  'bg-gray-100',
  enclosed: 'bg-amber-100',
  open:     'bg-white',
  path:     'bg-gray-300',
  water:    'bg-blue-200',
  barrier:  'bg-gray-800',
}

const PASSAGE_SYMBOLS: Record<PassageTypeLocal, string> = {
  open:    '·',
  door:    '▬',
  secret:  '?',
  locked:  '⊠',
  one_way: '→',
  blocked: '✕',
}

const PASSAGE_CLASSES: Record<PassageTypeLocal | 'none', string> = {
  none:    'bg-gray-400 hover:bg-gray-300',
  open:    'bg-green-200 hover:bg-green-300 text-green-800',
  door:    'bg-yellow-300 hover:bg-yellow-400 text-yellow-900',
  secret:  'bg-purple-200 hover:bg-purple-300 text-purple-900',
  locked:  'bg-red-200 hover:bg-red-300 text-red-900',
  one_way: 'bg-blue-200 hover:bg-blue-300 text-blue-900',
  blocked: 'bg-red-500 hover:bg-red-600 text-white',
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
  edges: Map<string, PassageTypeLocal>
}

function normaliseEdge(x1: number, y1: number, x2: number, y2: number) {
  if (x1 > x2 || (x1 === x2 && y1 > y2)) return { x1: x2, y1: y2, x2: x1, y2: y1 }
  return { x1, y1, x2, y2 }
}

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const n = normaliseEdge(x1, y1, x2, y2)
  return `${n.x1},${n.y1},${n.x2},${n.y2}`
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
      .then((data: {
        width: number; height: number
        cells: Array<{ x: number; y: number; cellStyle: string; sectionNumber?: number | null; label?: string | null; notes?: string | null }>
        edges: Array<{ x1: number; y1: number; x2: number; y2: number; passageType: string }>
      }) => {
        const cells = new Map<string, CellData>()
        for (const c of data.cells) {
          cells.set(`${c.x},${c.y}`, {
            cellStyle: (CELL_STYLE_CYCLE.includes(c.cellStyle as CellStyleLocal) ? c.cellStyle : 'unknown') as CellStyleLocal,
            sectionNumber: c.sectionNumber, label: c.label, notes: c.notes,
          })
        }
        const edges = new Map<string, PassageTypeLocal>()
        for (const e of data.edges) {
          const k = edgeKey(e.x1, e.y1, e.x2, e.y2)
          if (PASSAGE_TYPE_CYCLE.includes(e.passageType as PassageTypeLocal)) {
            edges.set(k, e.passageType as PassageTypeLocal)
          }
        }
        setMapState({ width: data.width, height: data.height, cells, edges })
        setLoading(false)
      })
      .catch(() => { setError('Failed to load map'); setLoading(false) })
  }, [sessionId])

  const handleCellClick = useCallback(async (x: number, y: number) => {
    if (!mapState) return
    const key = `${x},${y}`
    const current = mapState.cells.get(key)?.cellStyle ?? 'unknown'
    const next = NEXT_CELL_STYLE[current]
    setMapState((prev) => {
      if (!prev) return prev
      const newCells = new Map(prev.cells)
      newCells.set(key, { ...prev.cells.get(key), cellStyle: next })
      return { ...prev, cells: newCells }
    })
    try {
      await fetch(`/api/sessions/${sessionId}/map/cells`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, cellStyle: next }),
      })
    } catch {
      setMapState((prev) => {
        if (!prev) return prev
        const newCells = new Map(prev.cells)
        newCells.set(key, { ...prev.cells.get(key), cellStyle: current })
        return { ...prev, cells: newCells }
      })
    }
  }, [mapState, sessionId])

  const handleEdgeClick = useCallback(async (x1: number, y1: number, x2: number, y2: number) => {
    if (!mapState) return
    const key = edgeKey(x1, y1, x2, y2)
    const current = mapState.edges.get(key) ?? 'none'
    const next = NEXT_PASSAGE[current]
    setMapState((prev) => {
      if (!prev) return prev
      const newEdges = new Map(prev.edges)
      if (next === 'none') { newEdges.delete(key) } else { newEdges.set(key, next as PassageTypeLocal) }
      return { ...prev, edges: newEdges }
    })
    try {
      const norm = normaliseEdge(x1, y1, x2, y2)
      if (next === 'none') {
        await fetch(`/api/sessions/${sessionId}/map/edges?x1=${norm.x1}&y1=${norm.y1}&x2=${norm.x2}&y2=${norm.y2}`, { method: 'DELETE' })
      } else {
        await fetch(`/api/sessions/${sessionId}/map/edges`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x1: norm.x1, y1: norm.y1, x2: norm.x2, y2: norm.y2, passageType: next }),
        })
      }
    } catch {
      setMapState((prev) => {
        if (!prev) return prev
        const newEdges = new Map(prev.edges)
        if (current === 'none') { newEdges.delete(key) } else { newEdges.set(key, current) }
        return { ...prev, edges: newEdges }
      })
    }
  }, [mapState, sessionId])

  if (loading) return <p className="mt-6 text-gray-500">Loading map…</p>
  if (error) return <p className="mt-6 text-red-500">{error}</p>
  if (!mapState) return null

  const { width, height, cells, edges } = mapState
  const gridW = 2 * width - 1
  const gridH = 2 * height - 1
  const colTemplate = Array.from({ length: gridW }, (_, i) => (i % 2 === 0 ? '28px' : '8px')).join(' ')
  const rowTemplate = Array.from({ length: gridH }, (_, i) => (i % 2 === 0 ? '28px' : '8px')).join(' ')

  const gridElements: React.ReactElement[] = []
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const k = `g-${gx}-${gy}`
      if (gx % 2 === 0 && gy % 2 === 0) {
        // Cell
        const cx = gx / 2, cy = gy / 2
        const mk = `${cx},${cy}`
        const cellData = cells.get(mk)
        const style = cellData?.cellStyle ?? 'unknown'
        gridElements.push(
          <button key={k}
            className={`w-full h-full ${CELL_CLASSES[style]} hover:opacity-80 transition-opacity`}
            onClick={() => handleCellClick(cx, cy)}
            title={`(${cx},${cy}) ${style}`}
            aria-label={`Cell ${cx},${cy}: ${style}`}
          />
        )
      } else if (gx % 2 === 1 && gy % 2 === 0) {
        // Vertical wall button: between (gx>>1, gy/2) and ((gx>>1)+1, gy/2)
        const x1 = gx >> 1, y1 = gy / 2, x2 = x1 + 1, y2 = y1
        const ek = edgeKey(x1, y1, x2, y2)
        const passage = edges.get(ek) ?? 'none'
        gridElements.push(
          <button key={k}
            className={`w-full h-full text-[6px] flex items-center justify-center ${PASSAGE_CLASSES[passage]} transition-colors`}
            onClick={() => handleEdgeClick(x1, y1, x2, y2)}
            title={`Edge (${x1},${y1})↔(${x2},${y2}): ${passage}`}
            aria-label={`Edge between ${x1},${y1} and ${x2},${y2}: ${passage}`}
          >
            {passage !== 'none' ? PASSAGE_SYMBOLS[passage] : ''}
          </button>
        )
      } else if (gx % 2 === 0 && gy % 2 === 1) {
        // Horizontal wall button: between (gx/2, gy>>1) and (gx/2, (gy>>1)+1)
        const x1 = gx / 2, y1 = gy >> 1, x2 = x1, y2 = y1 + 1
        const ek = edgeKey(x1, y1, x2, y2)
        const passage = edges.get(ek) ?? 'none'
        gridElements.push(
          <button key={k}
            className={`w-full h-full text-[6px] flex items-center justify-center ${PASSAGE_CLASSES[passage]} transition-colors`}
            onClick={() => handleEdgeClick(x1, y1, x2, y2)}
            title={`Edge (${x1},${y1})↔(${x2},${y2}): ${passage}`}
            aria-label={`Edge between ${x1},${y1} and ${x2},${y2}: ${passage}`}
          >
            {passage !== 'none' ? PASSAGE_SYMBOLS[passage] : ''}
          </button>
        )
      } else {
        // Corner — inert
        gridElements.push(<div key={k} className="bg-gray-500" />)
      }
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold mb-3">Map</h2>

      {/* Compass */}
      <div className="mb-1 flex flex-col items-start">
        <span className="text-xs text-gray-500 font-mono">N ↑</span>
        <span className="text-xs text-gray-500 font-mono">{"W ← → E"}</span>
        <span className="text-xs text-gray-500 font-mono">S ↓</span>
      </div>

      {/* Cell style legend */}
      <div className="mb-1 flex flex-wrap gap-2 text-xs">
        {CELL_STYLE_CYCLE.map((style) => (
          <span key={style} className={`px-2 py-0.5 rounded border border-gray-300 ${CELL_CLASSES[style]} ${style === 'barrier' ? 'text-white' : ''}`}>
            {style}
          </span>
        ))}
      </div>

      {/* Passage type legend */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {PASSAGE_TYPE_CYCLE.map((pt) => (
          <span key={pt} className={`px-2 py-0.5 rounded border border-gray-300 ${PASSAGE_CLASSES[pt]}`}>
            {PASSAGE_SYMBOLS[pt]} {pt}
          </span>
        ))}
      </div>

      {/* Grid — scrollable */}
      <div className="overflow-auto max-h-[60vh] max-w-full">
        <div
          className="inline-grid border border-gray-400"
          style={{ gridTemplateColumns: colTemplate, gridTemplateRows: rowTemplate }}
        >
          {gridElements}
        </div>
      </div>
    </section>
  )
}
