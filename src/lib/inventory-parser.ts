/**
 * Parses a TSV/whitespace-delimited inventory list into structured items.
 *
 * Input format — one item per line:
 *   <count> <whitespace> <item name>
 *
 * Rules:
 * - Split on the first run of whitespace (tabs or multiple spaces)
 * - Left part: count (integer, defaults to 1 if blank or non-numeric)
 * - Right part: item name (string, required — line is skipped if missing or blank)
 * - Leading/trailing whitespace in each field is trimmed
 * - Blank lines are silently skipped
 */

export interface ParsedInventoryItem {
  count: number
  itemName: string
}

export function parseInventoryTsv(text: string): ParsedInventoryItem[] {
  if (!text || text.trim() === '') return []

  const results: ParsedInventoryItem[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '') continue

    // Split on the first run of whitespace (tabs or spaces)
    const match = line.match(/^(\S+)\s+(.+)$/)

    if (!match) {
      // No whitespace separator found — the entire line is one token.
      // Could be just a count with no item name, or just an item name with no count.
      // Either way, there is no item name in a parseable position — skip.
      continue
    }

    const [, rawCount, rawName] = match
    const itemName = rawName.trim()

    if (!itemName) continue

    const parsed = parseInt(rawCount, 10)
    const count = !isNaN(parsed) && parsed >= 1 ? parsed : 1

    results.push({ count, itemName })
  }

  return results
}
