import type { CombatModule } from '../../../../lib/game-systems/types'

interface EnemyFormState {
  [key: string]: string
}

interface EnemyCreationFormProps {
  enemyStatFields: CombatModule['enemyStatFields']
  enemyForm: EnemyFormState
  onFormChange: (update: (prev: EnemyFormState) => EnemyFormState) => void
  onSubmit: () => void
  isStarting: boolean
  startError: string | null
}

export function EnemyCreationForm({
  enemyStatFields,
  enemyForm,
  onFormChange,
  onSubmit,
  isStarting,
  startError,
}: EnemyCreationFormProps) {
  return (
    <div className="border rounded p-4 max-w-md">
      <h3 className="font-semibold mb-3">New fight</h3>
      <div className="flex items-center gap-2 mb-2">
        <label className="w-28 text-sm shrink-0">
          Enemy name<span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          required
          className="border rounded px-2 py-1 text-sm flex-1"
          value={enemyForm['enemyName'] ?? ''}
          onChange={e => onFormChange(prev => ({ ...prev, enemyName: e.target.value }))}
        />
      </div>
      {enemyStatFields.map((field) => (
        <div key={field.key} className="flex items-center gap-2 mb-2">
          <label className="w-28 text-sm shrink-0">
            {field.label}
            {'required' in field && field.required && <span className="text-red-500">*</span>}
          </label>
          {field.type === 'radio' ? (
            <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label={field.label}>
              {field.options.map((opt) => {
                const currentVal =
                  enemyForm[field.key] !== undefined
                    ? enemyForm[field.key]
                    : field.default ?? ''
                return (
                  <label key={opt.value} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={field.key}
                      value={opt.value}
                      checked={currentVal === opt.value}
                      onChange={() =>
                        onFormChange((prev) => ({ ...prev, [field.key]: opt.value }))
                      }
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={
                enemyForm[field.key] !== undefined
                  ? enemyForm[field.key]
                  : field.default !== undefined
                    ? String(field.default)
                    : ''
              }
              min={field.type === 'number' && (field.key === 'enemyDamageBonus' || field.key === 'playerDamageBonus' || field.key === 'playerArmourReduction') ? 0 : undefined}
              onChange={(e) =>
                onFormChange((prev) => ({ ...prev, [field.key]: e.target.value }))
              }
              className="border rounded px-2 py-1 text-sm flex-1"
              aria-label={field.label}
            />
          )}
        </div>
      ))}
      {startError && <p className="text-red-600 text-sm mb-2">{startError}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onSubmit}
          disabled={isStarting || !(enemyForm['enemyName'] ?? '').trim()}
          className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-40"
        >
          {isStarting ? 'Starting…' : 'Start fight'}
        </button>
      </div>
    </div>
  )
}
