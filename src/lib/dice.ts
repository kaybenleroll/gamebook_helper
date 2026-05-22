/**
 * Roll `count` dice each with `sides` faces.
 * Returns an array of individual roll results.
 */
export function rollDice(count: number, sides: number): number[] {
  const rolls: number[] = []
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }
  return rolls
}
