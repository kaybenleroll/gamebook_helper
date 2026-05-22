'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { worldToScreen, screenToWorld, type Pan } from '../../../../lib/mapCoordinates'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZOOM_MIN = 0.2
const ZOOM_MAX = 4
const ZOOM_STEP = 0.1
/** Padding (world units) added around all nodes when computing canvas bounds. */
const BOUNDS_PADDING = 200

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SvgCanvasProps {
  /** Bounding boxes of all nodes in world coordinates (used to clamp + fit). */
  nodeBounds?: NodeBounds[]
  /** Called when the user clicks on the canvas background. */
  onBackgroundClick?: (worldX: number, worldY: number) => void
  /** Called when the user clicks on a node (by index). Stub — wired in Slice 4c. */
  onNodeClick?: (index: number, worldX: number, worldY: number) => void
  /** Children are rendered inside the world-transformed SVG group. */
  children?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeWorldBounds(nodeBounds: NodeBounds[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} | null {
  if (nodeBounds.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const b of nodeBounds) {
    minX = Math.min(minX, b.x - BOUNDS_PADDING)
    minY = Math.min(minY, b.y - BOUNDS_PADDING)
    maxX = Math.max(maxX, b.x + b.width + BOUNDS_PADDING)
    maxY = Math.max(maxY, b.y + b.height + BOUNDS_PADDING)
  }

  return { minX, minY, maxX, maxY }
}

/** Clamp pan so the world bounds stay visible. */
function clampPan(
  pan: Pan,
  zoom: number,
  viewWidth: number,
  viewHeight: number,
  nodeBounds: NodeBounds[],
): Pan {
  const bounds = computeWorldBounds(nodeBounds)
  if (!bounds) return pan

  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxY - bounds.minY

  const minPanX = viewWidth - bounds.maxX * zoom
  const maxPanX = -bounds.minX * zoom + viewWidth - Math.min(viewWidth, worldW * zoom)
  const minPanY = viewHeight - bounds.maxY * zoom
  const maxPanY = -bounds.minY * zoom + viewHeight - Math.min(viewHeight, worldH * zoom)

  return {
    x: Math.min(Math.max(pan.x, minPanX), maxPanX),
    y: Math.min(Math.max(pan.y, minPanY), maxPanY),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SvgCanvas({
  nodeBounds = [],
  onBackgroundClick,
  children,
}: SvgCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  // Track container size for fit-all and clamp calculations.
  const [viewSize, setViewSize] = useState({ width: 800, height: 600 })

  // Drag state (stored in a ref to avoid re-renders on every mouse move).
  const dragRef = useRef<{ startX: number; startY: number; originPan: Pan } | null>(null)

  // ---------------------------------------------------------------------------
  // Measure container
  // ---------------------------------------------------------------------------

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setViewSize({ width, height })
      }
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // ---------------------------------------------------------------------------
  // Fit-all on initial load
  // ---------------------------------------------------------------------------

  const [hasFitted, setHasFitted] = useState(false)

  useEffect(() => {
    if (hasFitted) return

    const bounds = computeWorldBounds(nodeBounds)

    if (!bounds) {
      // No nodes — centre at world origin.
      setPan({ x: viewSize.width / 2, y: viewSize.height / 2 })
      setZoom(1)
      setHasFitted(true)
      return
    }

    const worldW = bounds.maxX - bounds.minX
    const worldH = bounds.maxY - bounds.minY

    if (worldW === 0 || worldH === 0) {
      setHasFitted(true)
      return
    }

    const fitZoom = Math.min(
      viewSize.width / worldW,
      viewSize.height / worldH,
      ZOOM_MAX,
    )
    const clampedZoom = Math.max(fitZoom, ZOOM_MIN)

    const centreWorldX = (bounds.minX + bounds.maxX) / 2
    const centreWorldY = (bounds.minY + bounds.maxY) / 2

    setPan({
      x: viewSize.width / 2 - centreWorldX * clampedZoom,
      y: viewSize.height / 2 - centreWorldY * clampedZoom,
    })
    setZoom(clampedZoom)
    setHasFitted(true)
  }, [hasFitted, nodeBounds, viewSize])

  // ---------------------------------------------------------------------------
  // Pointer events — drag
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Only drag on the background (SVG root or the background rect).
      if ((e.target as SVGElement).dataset.role !== 'background') return

      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originPan: pan,
      }
    },
    [pan],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return

      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY

      const newPan = {
        x: dragRef.current.originPan.x + dx,
        y: dragRef.current.originPan.y + dy,
      }

      // Clamp only when there are nodes.
      const clamped =
        nodeBounds.length > 0
          ? clampPan(newPan, zoom, viewSize.width, viewSize.height, nodeBounds)
          : newPan

      setPan(clamped)
    },
    [zoom, viewSize, nodeBounds],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return

      const dx = Math.abs(e.clientX - dragRef.current.startX)
      const dy = Math.abs(e.clientY - dragRef.current.startY)
      const wasDrag = dx > 4 || dy > 4

      dragRef.current = null

      if (!wasDrag && onBackgroundClick) {
        const svgRect = svgRef.current?.getBoundingClientRect()
        if (!svgRect) return
        const screenX = e.clientX - svgRect.left
        const screenY = e.clientY - svgRect.top
        const { x: worldX, y: worldY } = screenToWorld(screenX, screenY, pan, zoom)
        onBackgroundClick(worldX, worldY)
      }
    },
    [pan, zoom, onBackgroundClick],
  )

  // ---------------------------------------------------------------------------
  // Scroll wheel — zoom
  // ---------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()

      const svgRect = svgRef.current?.getBoundingClientRect()
      if (!svgRect) return

      const screenX = e.clientX - svgRect.left
      const screenY = e.clientY - svgRect.top

      // World point under cursor — must stay fixed after zoom.
      const { x: worldX, y: worldY } = screenToWorld(screenX, screenY, pan, zoom)

      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      const newZoom = Math.min(Math.max(zoom + delta, ZOOM_MIN), ZOOM_MAX)

      // Adjust pan so that the world point under the cursor stays at (screenX, screenY).
      const newPan = {
        x: screenX - worldX * newZoom,
        y: screenY - worldY * newZoom,
      }

      const clamped =
        nodeBounds.length > 0
          ? clampPan(newPan, newZoom, viewSize.width, viewSize.height, nodeBounds)
          : newPan

      setZoom(newZoom)
      setPan(clamped)
    },
    [pan, zoom, viewSize, nodeBounds],
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`

  return (
    <svg
      ref={svgRef}
      className="w-full h-full touch-none select-none"
      style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Background — must carry data-role="background" for hit-testing */}
      <rect
        data-role="background"
        x="-10000"
        y="-10000"
        width="20000"
        height="20000"
        fill="transparent"
      />

      {/* World-space group: all children are placed here */}
      <g transform={transform}>{children}</g>
    </svg>
  )
}

// Re-export coordinate helpers so consumers can import from one place.
export { worldToScreen, screenToWorld }
export type { Pan }
