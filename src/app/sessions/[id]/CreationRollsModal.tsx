'use client'

import type { CreationRolls } from '../../../lib/db/schema'

interface Props {
  sessionId: number
  creationRolls: CreationRolls
  onDismiss: () => void
}

export default function CreationRollsModal({ sessionId, creationRolls, onDismiss }: Props) {
  async function handleDismiss() {
    await fetch(`/api/sessions/${sessionId}/character`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearCreationRolls: true }),
    })
    onDismiss()
  }

  const entries = Object.values(creationRolls)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold mb-1">Your starting stats</h2>
        <p className="text-gray-600 text-sm mb-4">Here are the dice rolls that determined your character.</p>

        <div className="space-y-4">
          {entries.map((detail) => {
            const hasMultipleAttempts = detail.attempts.length > 1
            const showMultiplier = detail.multiplier !== 1

            return (
              <div key={detail.statLabel} className="border rounded p-3">
                <div className="font-medium mb-2">{detail.statLabel}</div>
                <div className="space-y-1 text-sm">
                  {detail.attempts.map((attempt, i) => {
                    const isBest = attempt.total === detail.best
                    return (
                      <div
                        key={i}
                        className={hasMultipleAttempts && isBest ? 'text-green-700 font-medium' : 'text-gray-600'}
                      >
                        ({attempt.dice.join('+')})={attempt.total}
                        {hasMultipleAttempts && isBest ? ' ✓' : ''}
                      </div>
                    )
                  })}
                </div>
                {showMultiplier ? (
                  <div className="mt-2 text-sm font-semibold">
                    best {detail.best} × {detail.multiplier} = {detail.result} {detail.statLabel}
                  </div>
                ) : (
                  <div className="mt-2 text-sm font-semibold">
                    = {detail.result} {detail.statLabel}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
