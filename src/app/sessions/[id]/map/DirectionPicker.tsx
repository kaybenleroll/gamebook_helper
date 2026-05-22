'use client'

import type { Direction } from '../../../../lib/db/schema'

interface DirectionPickerProps {
  hasParent: boolean
  onSelect: (direction: Direction | null) => void
  onCancel: () => void
}

export default function DirectionPicker({
  hasParent,
  onSelect,
  onCancel,
}: DirectionPickerProps) {
  const btnBase =
    'px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors'
  const btnSecondary =
    'px-3 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm rounded font-medium transition-colors'

  return (
    /* Modal backdrop */
    <div
      className="absolute inset-0 flex items-center justify-center bg-black/30 z-50"
      onClick={onCancel}
    >
      {/* Picker card — stop click propagation so the backdrop dismiss works */}
      <div
        className="bg-white rounded-lg shadow-lg p-5 flex flex-col items-center gap-3 min-w-[200px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="text-sm font-semibold text-gray-700 mb-1">
          Choose direction
        </h4>

        {/* Compass layout — 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          {/* Row 1: empty, N, empty */}
          <div />
          <button
            className={btnBase}
            aria-label="North"
            onClick={() => onSelect('N')}
          >
            ↑ N
          </button>
          <div />

          {/* Row 2: W, up/down, E */}
          <button
            className={btnBase}
            aria-label="West"
            onClick={() => onSelect('W')}
          >
            ← W
          </button>
          <div className="flex flex-col gap-2">
            <button
              className={btnBase}
              aria-label="Up"
              onClick={() => onSelect('up')}
            >
              ▲ up
            </button>
            <button
              className={btnBase}
              aria-label="Down"
              onClick={() => onSelect('down')}
            >
              ▼ dn
            </button>
          </div>
          <button
            className={btnBase}
            aria-label="East"
            onClick={() => onSelect('E')}
          >
            E →
          </button>

          {/* Row 3: empty, S, empty */}
          <div />
          <button
            className={btnBase}
            aria-label="South"
            onClick={() => onSelect('S')}
          >
            ↓ S
          </button>
          <div />
        </div>

        {/* Bottom row */}
        <div className="flex gap-2 mt-1">
          {hasParent && (
            <button
              className={btnSecondary}
              onClick={() => onSelect(null)}
            >
              No connection
            </button>
          )}
          <button className={btnSecondary} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
