import { NextRequest, NextResponse } from 'next/server'

// Parses a dice formula in NdN or NdN+M / NdN-M format.
// Returns null if the formula is invalid.
function parseFormula(formula: string): { count: number; sides: number; modifier: number } | null {
  const match = formula.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  if (!match) return null

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  if (count < 1 || sides < 1) return null

  return { count, sides, modifier }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { formula?: unknown }
    const { formula } = body

    if (!formula || typeof formula !== 'string') {
      return NextResponse.json({ error: 'formula is required and must be a string' }, { status: 400 })
    }

    const parsed = parseFormula(formula)
    if (!parsed) {
      return NextResponse.json(
        { error: `Invalid dice formula: "${formula}". Expected format: NdN, e.g. 2d6 or 1d6+2` },
        { status: 400 },
      )
    }

    const { count, sides, modifier } = parsed
    const rolls: number[] = []
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1)
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + modifier

    return NextResponse.json({ rolls, total })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
