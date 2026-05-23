'use client'

import { useState } from 'react'

interface SectionEntry {
  sectionNumber: number
  visitedAt: string
}

interface Props {
  sessionId: number
  initialCurrentSection: number | null
  initialHistory: SectionEntry[]
}

export default function SectionTracker({
  sessionId,
  initialCurrentSection,
  initialHistory,
}: Props) {
  const [currentSection, setCurrentSection] = useState<number | null>(initialCurrentSection)
  const [history, setHistory] = useState<SectionEntry[]>(initialHistory)
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function goToSection() {
    const sectionNumber = parseInt(inputValue, 10)
    if (!Number.isInteger(sectionNumber) || sectionNumber < 1) {
      setError('Please enter a valid section number.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/sessions/${sessionId}/section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionNumber }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Failed to record section.')
        return
      }

      const entry = await res.json() as SectionEntry
      setHistory((prev) => [...prev, entry])
      setCurrentSection(sectionNumber)
      setInputValue('')
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

  const displayHistory = [...history].reverse()

  return (
    <section className="mt-6 bg-panel-bg rounded-xl shadow-sm border border-panel-border p-4">
      <h2 className="font-heading text-lg text-header-accent border-l-4 border-header-accent pl-3 mb-3">Section Tracker</h2>

      <div className="mb-4">
        <span className="text-sm text-gray-500 uppercase tracking-wide">Current section</span>
        <p className="text-4xl font-mono font-bold mt-1">
          {currentSection !== null ? currentSection : '—'}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="number"
          min={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Section number"
          className="w-36 px-3 py-2 border rounded font-mono text-sm"
          aria-label="Section number"
        />
        <button
          onClick={() => void goToSection()}
          disabled={submitting || inputValue === ''}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {submitting ? 'Saving…' : 'Go to section'}
        </button>
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>

      {history.length > 0 && (
        <div>
          <p className="text-sm text-text-muted mb-2">History (most recent first)</p>
          <div className="max-h-48 overflow-y-auto">
            <div className="relative pl-4 border-l-2 border-panel-border space-y-3">
              {displayHistory.map((entry, index) => {
                const isCurrentNode = index === 0
                return (
                  <div key={`${entry.sectionNumber}-${entry.visitedAt}`} className="flex items-center gap-3 relative">
                    <div
                      className={`absolute -left-5 flex items-center justify-center ${
                        isCurrentNode
                          ? 'w-4 h-4 rounded-full bg-header-accent'
                          : 'w-3 h-3 rounded-full bg-accent-blue'
                      }`}
                    />
                    <span
                      className={`font-mono ${
                        isCurrentNode
                          ? 'font-bold text-text-primary'
                          : 'text-sm text-text-muted'
                      }`}
                    >
                      {entry.sectionNumber}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
