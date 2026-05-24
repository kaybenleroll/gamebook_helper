import type { RollAttempt } from './db/schema'

/**
 * Roll `count` dice each with `sides` faces.
 * Returns an array of individual roll results.
 */
function rollOnce(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
}

export interface RollResult {
  result: number
  best: number
  attempts: RollAttempt[]
}

/**
 * Roll dice with optional bestOf / worstOf / multiplier support.
 *
 * @param count     Number of dice per attempt
 * @param sides     Number of faces per die
 * @param modifier  Flat value added after multiplier (default 0)
 * @param multiplier Factor applied to the best/worst total before adding modifier (default 1)
 * @param bestOf    Roll this many times and keep the highest total
 * @param worstOf   Roll this many times and keep the lowest total
 */
export function rollDice(
  count: number,
  sides: number,
  modifier = 0,
  multiplier = 1,
  bestOf?: number,
  worstOf?: number,
): RollResult {
  const numAttempts = bestOf ?? worstOf ?? 1
  const attempts: RollAttempt[] = Array.from({ length: numAttempts }, () => {
    const dice = rollOnce(count, sides)
    return { dice, total: dice.reduce((s, d) => s + d, 0) }
  })
  const best =
    worstOf != null
      ? Math.min(...attempts.map((a) => a.total))
      : Math.max(...attempts.map((a) => a.total))
  return { result: best * multiplier + modifier, best, attempts }
}

/**
 * Parse a dice formula string such as "2d6", "1d6+2", or "3d8-1".
 * Returns null if the formula is invalid or has non-positive count / sides.
 */
export function parseDiceFormula(
  formula: string,
): { count: number; sides: number; modifier: number } | null {
  const match = formula.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  if (!match) return null

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  if (count < 1 || sides < 1) return null

  return { count, sides, modifier }
}
