import type { RoundOption } from '../../../../lib/game-systems/types'
import type { LuckResult } from './types'

interface PendingCommitState {
  damageDealt: number
  damageTaken: number
  phaseTwoSkipped: boolean
  luckAttackUsed: boolean
  luckDefenceUsed: boolean
  luckResults: LuckResult[]
  overrideDamageDealt: string
  overrideDamageTaken: string
}

interface RoundPanelProps {
  // Pre-roll state
  activeCombatOptions: RoundOption[]
  roundOptions: Record<string, unknown>
  onRoundOptionChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  combatModifiers: Record<string, unknown>
  onCombatModifierChange: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void
  showModifiers: boolean
  onToggleModifiers: () => void
  isResolving: boolean
  onResolveRound: () => void
  onFlee: () => void

  // Post-roll state
  pendingResult: PendingCommitState | null
  onOverrideDamageDealt: (value: string) => void
  onOverrideDamageTaken: (value: string) => void
  onLuckTest: (type: 'attack' | 'defence') => void
  effectiveLuck: number
  hasTestLuck?: boolean
  isCommitting: boolean
  onCommitOverrides: () => void

  roundError: string | null
}

export function RoundPanel({
  activeCombatOptions,
  roundOptions,
  onRoundOptionChange,
  combatModifiers,
  onCombatModifierChange,
  showModifiers,
  onToggleModifiers,
  isResolving,
  onResolveRound,
  onFlee,
  pendingResult,
  onOverrideDamageDealt,
  onOverrideDamageTaken,
  onLuckTest,
  effectiveLuck,
  hasTestLuck,
  isCommitting,
  onCommitOverrides,
  roundError,
}: RoundPanelProps) {
  if (!pendingResult) {
    return (
      <div className="mb-4">
        <h4 className="font-semibold mb-2">Round options</h4>
        {activeCombatOptions.map((opt) => (
          <div key={opt.key} className="flex items-center gap-3 mb-2">
            {opt.type === 'boolean' && (
              <>
                <input
                  type="checkbox"
                  id={`opt-${opt.key}`}
                  checked={roundOptions[opt.key] === true}
                  onChange={(e) => onRoundOptionChange((prev) => ({ ...prev, [opt.key]: e.target.checked }))}
                />
                <label htmlFor={`opt-${opt.key}`} className="text-sm" title={opt.description}>
                  {opt.label}
                </label>
              </>
            )}
            {opt.type === 'number' && (
              <>
                <label htmlFor={`opt-${opt.key}`} className="text-sm w-28" title={opt.description}>
                  {opt.label}
                </label>
                <input
                  id={`opt-${opt.key}`}
                  type="number"
                  value={typeof roundOptions[opt.key] === 'number' ? String(roundOptions[opt.key]) : String(opt.default)}
                  onChange={(e) => onRoundOptionChange((prev) => ({ ...prev, [opt.key]: parseFloat(e.target.value) }))}
                  className="border rounded px-2 py-1 text-sm w-20"
                />
              </>
            )}
          </div>
        ))}

        <button onClick={onToggleModifiers} className="text-sm text-blue-600 hover:underline mt-1">
          {showModifiers ? '▲ Hide modifiers' : '▼ Combat modifiers'}
        </button>
        {showModifiers && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { key: 'attackBonus', label: 'Attack bonus' },
              { key: 'damageBonus', label: 'Damage bonus' },
              { key: 'playerThreshold', label: 'Player threshold' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs w-32 shrink-0">{label}</label>
                <input
                  type="number"
                  value={typeof combatModifiers[key] === 'number' ? String(combatModifiers[key]) : ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    onCombatModifierChange((prev) => ({ ...prev, [key]: isNaN(v) ? undefined : v }))
                  }}
                  placeholder="0"
                  className="border rounded px-2 py-1 text-sm w-16"
                />
              </div>
            ))}
          </div>
        )}

        {roundError && <p className="text-red-600 text-sm mt-2">{roundError}</p>}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onResolveRound}
            disabled={isResolving}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40"
          >
            {isResolving ? 'Rolling…' : 'Resolve round'}
          </button>
          <button onClick={onFlee} className="px-4 py-2 border border-gray-400 rounded hover:bg-gray-100">
            Flee
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 border rounded p-3 bg-yellow-50">
      <h4 className="font-semibold mb-2 text-sm">Override round result?</h4>
      <div className={`grid gap-3 ${pendingResult.phaseTwoSkipped ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className="text-xs block mb-1">Damage dealt</label>
          <input
            type="number"
            min="0"
            value={pendingResult.overrideDamageDealt}
            onChange={(e) => onOverrideDamageDealt(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full"
          />
        </div>
        {!pendingResult.phaseTwoSkipped && (
          <div>
            <label className="text-xs block mb-1">Damage taken</label>
            <input
              type="number"
              min="0"
              value={pendingResult.overrideDamageTaken}
              onChange={(e) => onOverrideDamageTaken(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-full"
            />
          </div>
        )}
      </div>

      {hasTestLuck && (
        <div className="mt-3 pt-3 border-t border-amber-200">
          <p className="text-xs font-medium text-amber-800 mb-2">
            Test Your Luck
            {effectiveLuck > 0 && <span className="ml-1 text-amber-600">(Luck: {effectiveLuck})</span>}
            {effectiveLuck <= 0 && <span className="ml-1 text-gray-400">(Luck exhausted)</span>}
          </p>
          <div className="flex flex-col gap-2">
            {pendingResult.damageDealt > 0 && !pendingResult.luckAttackUsed && effectiveLuck > 0 && (
              <button
                onClick={() => onLuckTest('attack')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium"
              >
                Test Luck (Attack) — Lucky: +2 dmg dealt · Unlucky: −1 dmg dealt
              </button>
            )}
            {pendingResult.luckAttackUsed && (() => {
              const r = pendingResult.luckResults.find((lr) => lr.type === 'attack')
              return r ? (
                <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1.5">
                  <span className="font-semibold">Attack luck:</span> rolled {r.roll} —{' '}
                  <span className={r.success ? 'text-green-700' : 'text-red-700'}>
                    {r.success ? 'Lucky!' : 'Unlucky!'}
                  </span>{' '}
                  ({r.delta > 0 ? '+' : ''}{r.delta} dmg dealt)
                </div>
              ) : null
            })()}

            {!pendingResult.phaseTwoSkipped && pendingResult.damageTaken > 0 && !pendingResult.luckDefenceUsed && effectiveLuck > 0 && (
              <button
                onClick={() => onLuckTest('defence')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-medium"
              >
                Test Luck (Defence) — Lucky: −1 dmg taken · Unlucky: +1 dmg taken
              </button>
            )}
            {pendingResult.luckDefenceUsed && (() => {
              const r = pendingResult.luckResults.find((lr) => lr.type === 'defence')
              return r ? (
                <div className="text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-1.5">
                  <span className="font-semibold">Defence luck:</span> rolled {r.roll} —{' '}
                  <span className={r.success ? 'text-green-700' : 'text-red-700'}>
                    {r.success ? 'Lucky!' : 'Unlucky!'}
                  </span>{' '}
                  ({r.delta > 0 ? '+' : ''}{r.delta} dmg taken)
                </div>
              ) : null
            })()}
          </div>
        </div>
      )}

      {roundError && <p className="text-red-600 text-sm mt-2">{roundError}</p>}
      <button
        onClick={onCommitOverrides}
        disabled={isCommitting}
        className="mt-3 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40 text-sm"
      >
        {isCommitting ? 'Committing…' : 'Commit round'}
      </button>
    </div>
  )
}
