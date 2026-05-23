'use client'

import { useState, useRef } from 'react'

interface SectionEntry {
  sectionNumber: number
  visitedAt: string
}

interface Props {
  sessionId: number
  initialCurrentSection: number | null
  initialHistory: SectionEntry[]
}

export default function SectionBreadcrumb({ sessionId, initialCurrentSection, initialHistory }: Props) {
  const [currentSection, setCurrentSection] = useState<number | null>(initialCurrentSection)
  const [history, setHistory] = useState<SectionEntry[]>(initialHistory)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function goToSection() {
    const num = parseInt(input, 10)
    if (!Number.isInteger(num) || num < 1) {
      setError('Invalid section number')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionNumber: num }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to save section')
        return
      }
      const entry = await res.json() as SectionEntry
      setHistory(prev => [...prev, entry])
      setCurrentSection(num)
      setInput('')
      setTimeout(() => {
        scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' })
      }, 50)
    } catch {
      setError('Unable to reach server.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      void goToSection()
    }
  }

  return (
    <div className="shrink-0 bg-panel-bg border-b border-panel-border px-4 py-2 flex items-center gap-4">
      {/* Current section */}
      <div className="shrink-0 flex items-center gap-2">
        <span className="font-body text-text-muted text-sm">Section</span>
        <span className="font-mono font-bold text-header-accent text-xl">
          {currentSection ?? '—'}
        </span>
      </div>

      {/* Breadcrumb history */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto flex items-center gap-1 min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {history.map((entry, i) => {
          const isCurrent = i === history.length - 1
          return (
            <span key={`${entry.sectionNumber}-${entry.visitedAt}`} className="flex items-center gap-1 shrink-0">
              {i > 0 && <span className="text-text-muted text-xs">→</span>}
              <span className={
                isCurrent
                  ? 'font-mono text-sm font-bold text-header-accent'
                  : 'font-mono text-sm text-text-muted'
              }>
                {entry.sectionNumber}
              </span>
            </span>
          )
        })}
      </div>

      {/* Navigation input */}
      <div className="shrink-0 flex items-center gap-2">
        {error && <span className="text-red-500 text-xs">{error}</span>}
        <input
          type="number"
          min={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Go to..."
          className="font-mono w-20 border border-panel-border rounded px-2 py-1 text-sm text-text-primary bg-canvas-bg outline-none focus:border-header-accent"
          aria-label="Section number"
        />
        <button
          onClick={() => void goToSection()}
          disabled={submitting || input === ''}
          className="font-heading text-sm bg-header-accent text-white px-3 py-1 rounded-lg hover:opacity-90 active:scale-95 transition-transform disabled:opacity-50"
          type="button"
        >
          {submitting ? 'Saving…' : 'Go'}
        </button>
      </div>
    </div>
  )
}
