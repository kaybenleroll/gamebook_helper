'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface Session {
  id: number
  bookTitle: string
  gameSystemName: string
  createdAt: Date | number
}

interface Props {
  initialSessions: Session[]
}

export default function SessionsListClient({ initialSessions }: Props) {
  const [sessionList, setSessionList] = useState(initialSessions)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const targetSession = sessionList.find((s) => s.id === deletingId) ?? null

  useEffect(() => {
    if (deletingId !== null) {
      setConfirmText('')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [deletingId])

  function openModal(id: number) {
    setDeletingId(id)
  }

  function closeModal() {
    setDeletingId(null)
    setConfirmText('')
    setError(null)
  }

  async function handleDelete() {
    if (!targetSession || confirmText !== targetSession.bookTitle) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${targetSession.id}`, { method: 'DELETE' })
      if (res.status === 204) {
        setSessionList((prev) => prev.filter((s) => s.id !== targetSession.id))
        closeModal()
      } else {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to delete adventure.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  function formatDate(createdAt: Date | number): string {
    return createdAt instanceof Date
      ? createdAt.toLocaleDateString('en-GB')
      : new Date((createdAt as number) * 1000).toLocaleDateString('en-GB')
  }

  return (
    <>
      {sessionList.length === 0 ? (
        <p className="text-gray-600">No adventures yet. Start one above.</p>
      ) : (
        <ul className="space-y-3">
          {sessionList.map((session) => (
            <li key={session.id} className="flex items-center gap-2">
              <Link
                href={`/sessions/${session.id}`}
                className="flex-1 block p-4 border rounded hover:bg-gray-50"
              >
                <div className="font-medium">{session.bookTitle}</div>
                <div className="text-sm text-gray-500">
                  {session.gameSystemName} &middot; {formatDate(session.createdAt)}
                </div>
              </Link>
              <button
                onClick={() => openModal(session.id)}
                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                aria-label={`Delete ${session.bookTitle}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {deletingId !== null && targetSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold mb-2">Delete Adventure</h2>
            <p className="text-gray-700 mb-1">
              This will permanently delete this adventure and all associated data.
            </p>
            <p className="text-gray-700 mb-4">
              Type the book title to confirm deletion:{' '}
              <span className="font-semibold">{targetSession.bookTitle}</span>
            </p>
            <input
              ref={inputRef}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
              placeholder="Type book title here"
            />
            {error && <p className="text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={deleting}
                className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== targetSession.bookTitle || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
