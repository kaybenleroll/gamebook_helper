'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  systems: { id: string; name: string }[]
}

export default function NewSessionForm({ systems }: Props) {
  const router = useRouter()
  const [gameSystemId, setGameSystemId] = useState(systems[0]?.id ?? '')
  const [bookTitle, setBookTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!gameSystemId || !bookTitle.trim()) {
      setError('Please select a game system and enter a book title.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSystemId, bookTitle: bookTitle.trim() }),
      })
      const data = (await res.json()) as { sessionId?: number; error?: string }
      if (res.status === 201 && data.sessionId != null) {
        router.push(`/sessions/${data.sessionId}`)
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">New Adventure</h1>
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div>
          <label htmlFor="gameSystem" className="block text-sm font-medium mb-1">
            Game System
          </label>
          <select
            id="gameSystem"
            value={gameSystemId}
            onChange={(e) => setGameSystemId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          >
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bookTitle" className="block text-sm font-medium mb-1">
            Book Title
          </label>
          <input
            id="bookTitle"
            type="text"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="Enter the book title"
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Start Adventure'}
        </button>
      </form>
    </>
  )
}
