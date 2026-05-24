function formatDice(dice: number[]): string {
  return `[${dice.join('+')}]`
}

interface RollBreakdownProps {
  detail: Record<string, unknown>
}

export function RollBreakdown({ detail }: RollBreakdownProps) {
  const playerDice = Array.isArray(detail['playerDice']) ? (detail['playerDice'] as number[]) : null
  const playerRoll = typeof detail['playerRoll'] === 'number' ? (detail['playerRoll'] as number) : null
  const playerThreshold = typeof detail['playerThreshold'] === 'number' ? (detail['playerThreshold'] as number) : null
  const playerAS = typeof detail['playerAS'] === 'number' ? (detail['playerAS'] as number) : null

  const enemyDice = Array.isArray(detail['enemyDice']) ? (detail['enemyDice'] as number[]) : null
  const enemyRoll = typeof detail['enemyRoll'] === 'number' ? (detail['enemyRoll'] as number) : null
  const enemyThreshold = typeof detail['enemyThreshold'] === 'number' ? (detail['enemyThreshold'] as number) : null
  const enemyAS = typeof detail['enemyAS'] === 'number' ? (detail['enemyAS'] as number) : null

  // No breakdown available for this round
  if (!playerDice && playerRoll === null) return null

  const playerExtra = playerAS !== null ? ` (AS: ${playerAS})` : playerThreshold !== null ? ` (threshold: ${playerThreshold})` : ''
  const enemyExtra = enemyAS !== null ? ` (AS: ${enemyAS})` : enemyThreshold !== null ? ` (threshold: ${enemyThreshold})` : ''

  const playerStr = playerDice
    ? `${formatDice(playerDice)} = ${playerRoll}${playerExtra}`
    : playerRoll !== null
      ? `roll: ${playerRoll}${playerExtra}`
      : null

  const enemyStr = enemyDice
    ? `${formatDice(enemyDice)} = ${enemyRoll}${enemyExtra}`
    : enemyRoll !== null
      ? `roll: ${enemyRoll}${enemyExtra}`
      : null

  return (
    <div className="mt-1 text-xs text-gray-400 font-mono flex gap-4 flex-wrap">
      {playerStr && <span>You: {playerStr}</span>}
      {enemyStr && <span>Enemy: {enemyStr}</span>}
    </div>
  )
}
