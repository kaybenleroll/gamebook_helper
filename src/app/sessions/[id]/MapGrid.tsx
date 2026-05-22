'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

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
  const [annotateMode, setAnnotateMode] = useState(false)
  const [annotatingCell, setAnnotatingCell] = useState<{ x: number; y: number } | null>(null)
  const [panelSectionNumber, setPanelSectionNumber] = useState<string>('')
  const [panelLabel, setPanelLabel] = useState<string>('')
  const [panelNotes, setPanelNotes] = useState<string>('')
  const annotateModeRef = useRef(annotateMode)
  annotateModeRef.current = annotateMode

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

  const openAnnotationPanel = useCallback((x: number, y: number, cellData: CellData | undefined) => {
    setAnnotatingCell({ x, y })
    setPanelSectionNumber(cellData?.sectionNumber != null ? String(cellData.sectionNumber) : '')
    setPanelLabel(cellData?.label ?? '')
    setPanelNotes(cellData?.notes ?? '')
  }, [])

  const handleCellClick = useCallback((x: number, y: number) => {
    if (!mapState) return
    if (annotateModeRef.current) {
      const key = `${x},${y}`
      openAnnotationPanel(x, y, mapState.cells.get(key))
      return
    }
    const key = `${x},${y}`
    const current = mapState.cells.get(key)?.cellStyle ?? 'unknown'
    const next = NEXT_CELL_STYLE[current]
    setMapState((prev) => {
      if (!prev) return prev
      const newCells = new Map(prev.cells)
      newCells.set(key, { ...prev.cells.get(key), cellStyle: next })
      return { ...prev, cells: newCells }
    })
    fetch(`/api/sessions/${sessionId}/map/cells`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y, cellStyle: next }),
    }).catch(() => {
      setMapState((prev) => {
        if (!prev) return prev
        const newCells = new Map(prev.cells)
        newCells.set(key, { ...prev.cells.get(key), cellStyle: current })
        return { ...prev, cells: newCells }
      })
    })
  }, [mapState, sessionId, openAnnotationPanel])

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

  const handleAnnotationSave = useCallback(async () => {
    if (!mapState || !annotatingCell) return
    const { x, y } = annotatingCell
    const key = `${x},${y}`
    const currentCellStyle = mapState.cells.get(key)?.cellStyle ?? 'unknown'
    const sectionNumber = panelSectionNumber.trim() !== '' ? Number(panelSectionNumber) : null
    const label = panelLabel.trim() !== '' ? panelLabel.trim() : null
    const notes = panelNotes.trim() !== '' ? panelNotes.trim() : null
    const payload = { x, y, cellStyle: currentCellStyle, sectionNumber, label, notes }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/map/cells`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updated: { cellStyle: string; sectionNumber?: number | null; label?: string | null; notes?: string | null } = await res.json()
        setMapState((prev) => {
          if (!prev) return prev
          const newCells = new Map(prev.cells)
          newCells.set(key, {
            cellStyle: (CELL_STYLE_CYCLE.includes(updated.cellStyle as CellStyleLocal) ? updated.cellStyle : currentCellStyle) as CellStyleLocal,
            sectionNumber: updated.sectionNumber ?? null,
            label: updated.label ?? null,
            notes: updated.notes ?? null,
          })
          return { ...prev, cells: newCells }
        })
      } else {
        // Optimistic update even on non-ok response
        setMapState((prev) => {
          if (!prev) return prev
          const newCells = new Map(prev.cells)
          newCells.set(key, { cellStyle: currentCellStyle, sectionNumber, label, notes })
          return { ...prev, cells: newCells }
        })
      }
    } catch {
      // Optimistic update on network error
      setMapState((prev) => {
        if (!prev) return prev
        const newCells = new Map(prev.cells)
        newCells.set(key, { cellStyle: currentCellStyle, sectionNumber, label, notes })
        return { ...prev, cells: newCells }
      })
    }
    setAnnotatingCell(null)
  }, [mapState, annotatingCell, panelSectionNumber, panelLabel, panelNotes, sessionId])

  const handleAnnotationClear = useCallback(async () => {
    if (!mapState || !annotatingCell) return
    const { x, y } = annotatingCell
    const key = `${x},${y}`
    const currentCellStyle = mapState.cells.get(key)?.cellStyle ?? 'unknown'
    const payload = { x, y, cellStyle: currentCellStyle, sectionNumber: null, label: null, notes: null }
    setMapState((prev) => {
      if (!prev) return prev
      const newCells = new Map(prev.cells)
      newCells.set(key, { cellStyle: currentCellStyle, sectionNumber: null, label: null, notes: null })
      return { ...prev, cells: newCells }
    })
    try {
      await fetch(`/api/sessions/${sessionId}/map/cells`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // best-effort; optimistic update already applied
    }
    setAnnotatingCell(null)
  }, [mapState, annotatingCell, sessionId])

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
        const notesTitle = cellData?.notes ? `\nNotes: ${cellData.notes}` : ''
        gridElements.push(
          <button key={k}
            className={`w-full h-full relative overflow-hidden ${CELL_CLASSES[style]} hover:opacity-80 transition-opacity`}
            onClick={() => handleCellClick(cx, cy)}
            title={`(${cx},${cy}) ${style}${notesTitle}`}
            aria-label={`Cell ${cx},${cy}: ${style}`}
          >
            {cellData?.sectionNumber != null && (
              <span className="absolute top-0 left-0 text-[8px] leading-none text-gray-700 select-none pointer-events-none">
                {cellData.sectionNumber}
              </span>
            )}
            {cellData?.label && (
              <span className="absolute inset-0 flex items-center justify-center text-[8px] leading-none text-gray-800 select-none pointer-events-none">
                {cellData.label}
              </span>
            )}
          </button>
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

      {/* Mode toggle */}
      <div className="mb-3">
        <button
          className={`px-3 py-1 text-sm rounded border transition-colors ${
            annotateMode
              ? 'bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200'
              : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => {
            setAnnotateMode((m) => !m)
            setAnnotatingCell(null)
          }}
          aria-pressed={annotateMode}
        >
          {annotateMode ? '↩ Map' : '✏ Annotate'}
        </button>
        {annotateMode && (
          <span className="ml-3 text-xs text-amber-700">Click a cell to annotate it</span>
        )}
      </div>

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

      {/* Annotation panel */}
      {annotatingCell && (
        <div className="mt-4 p-4 border border-amber-300 rounded bg-amber-50 max-w-sm">
          <h3 className="text-sm font-semibold mb-3 text-amber-900">
            Cell ({annotatingCell.x}, {annotatingCell.y})
          </h3>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="panel-section-number">
                Section number
              </label>
              <input
                id="panel-section-number"
                type="number"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-amber-400"
                value={panelSectionNumber}
                onChange={(e) => setPanelSectionNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="panel-label">
                Label
              </label>
              <input
                id="panel-label"
                type="text"
                maxLength={30}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-amber-400"
                value={panelLabel}
                onChange={(e) => setPanelLabel(e.target.value)}
                placeholder="Optional (max 30 chars)"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1" htmlFor="panel-notes">
                Notes
              </label>
              <textarea
                id="panel-notes"
                rows={3}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-amber-400 resize-none"
                value={panelNotes}
                onChange={(e) => setPanelNotes(e.target.value)}
                placeholder="Optional freeform notes"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
              onClick={handleAnnotationSave}
            >
              Save
            </button>
            <button
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              onClick={handleAnnotationClear}
            >
              Clear
            </button>
            <button
              className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
              onClick={() => setAnnotatingCell(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
