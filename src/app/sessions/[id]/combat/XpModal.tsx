interface XpModalProps {
  xpInput: string
  isSavingXp: boolean
  onXpInputChange: (value: string) => void
  onAward: () => void
  onSkip: () => void
}

export function XpModal({ xpInput, isSavingXp, onXpInputChange, onAward, onSkip }: XpModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg p-6 max-w-sm w-full mx-4">
        <h3 className="font-bold text-lg mb-3">Award XP from this fight?</h3>
        <input
          type="number"
          min="0"
          value={xpInput}
          onChange={(e) => onXpInputChange(e.target.value)}
          placeholder="XP amount"
          className="border rounded px-3 py-2 w-full mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onSkip}
            className="px-4 py-2 border rounded"
          >
            Skip
          </button>
          <button
            onClick={onAward}
            disabled={isSavingXp || xpInput === '' || isNaN(parseInt(xpInput, 10))}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
          >
            {isSavingXp ? 'Awarding…' : 'Award'}
          </button>
        </div>
      </div>
    </div>
  )
}
