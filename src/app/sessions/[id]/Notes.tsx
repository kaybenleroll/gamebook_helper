'use client'

import { useState } from 'react'

interface Props {
  sessionId: number
  initialNotes: string | null
}

export default function Notes({ sessionId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '')

  async function handleBlur() {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes.trim() === '' ? null : notes }),
    })
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-2">Notes</h2>
      <textarea
        className="w-full rounded border border-gray-300 p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y min-h-[8rem]"
        placeholder="Add notes about your adventure…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        aria-label="Notes"
      />
    </section>
  )
}
