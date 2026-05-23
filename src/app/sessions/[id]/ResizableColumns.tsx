'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Props {
  left: React.ReactNode
  right: React.ReactNode
  defaultLeftWidth?: number
}

export default function ResizableColumns({ left, right, defaultLeftWidth = 680 }: Props) {
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return defaultLeftWidth
    return Math.round(window.innerWidth * 0.45)
  })
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    e.preventDefault()
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(420, Math.min(900, e.clientX - rect.left))
      setLeftWidth(newWidth)
    }
    const handleMouseUp = () => {
      isDragging.current = false
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0">
      <div
        style={{ width: leftWidth, minWidth: leftWidth }}
        className="shrink-0 overflow-y-auto overflow-x-hidden"
      >
        {left}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className="w-1.5 mx-1 shrink-0 cursor-col-resize rounded-full bg-gray-200 hover:bg-blue-400 active:bg-blue-500 transition-colors"
        title="Drag to resize"
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {right}
      </div>
    </div>
  )
}
