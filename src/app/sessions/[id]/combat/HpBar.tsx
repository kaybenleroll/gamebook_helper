interface HpBarProps {
  current: number
  max: number
  label: string
}

export function HpBar({ current, max, label }: HpBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-mono">
          {current} / {max}
        </span>
      </div>
      <div className="h-3 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
