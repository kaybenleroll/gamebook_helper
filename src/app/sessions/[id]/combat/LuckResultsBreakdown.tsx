export function LuckResultsBreakdown({ luckResults }: { luckResults: unknown }) {
  if (!Array.isArray(luckResults) || luckResults.length === 0) return null
  return (
    <div className="mt-1 text-xs text-amber-700 flex flex-col gap-0.5">
      {(luckResults as Array<Record<string, unknown>>).map((r, i) => {
        const type = typeof r['type'] === 'string' ? r['type'] : '?'
        const roll = typeof r['roll'] === 'number' ? r['roll'] : '?'
        const success = r['success'] === true
        const delta = typeof r['delta'] === 'number' ? r['delta'] : 0
        const label = type === 'attack' ? 'Attack' : 'Defence'
        const outcome = success ? 'Lucky' : 'Unlucky'
        const deltaStr = (delta as number) > 0 ? `+${delta}` : String(delta)
        return (
          <span key={i}>
            Luck ({label}): rolled {roll} — {outcome} ({deltaStr} dmg {type === 'attack' ? 'dealt' : 'taken'})
          </span>
        )
      })}
    </div>
  )
}
