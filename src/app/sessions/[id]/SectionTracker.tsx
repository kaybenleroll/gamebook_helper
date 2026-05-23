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
          <p className="text-sm text-gray-500 mb-1">History (most recent first)</p>
          <p className="font-mono text-sm text-gray-700 leading-relaxed">
            {displayHistory.map((v) => v.sectionNumber).join(' → ')}
          </p>
        </div>
      )}
    </section>
  )
}
