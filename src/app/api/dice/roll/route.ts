import { NextRequest, NextResponse } from 'next/server'
import { rollDice, parseDiceFormula } from '../../../../lib/dice'
import logger from '../../../../lib/logger'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { formula?: unknown }
    const { formula } = body

    if (!formula || typeof formula !== 'string') {
      return NextResponse.json({ error: 'formula is required and must be a string' }, { status: 400 })
    }

    const parsed = parseDiceFormula(formula)
    if (!parsed) {
      return NextResponse.json(
        { error: `Invalid dice formula: "${formula}". Expected format: NdN, e.g. 2d6 or 1d6+2` },
        { status: 400 },
      )
    }

    const { count, sides, modifier } = parsed
    const { attempts, result } = rollDice(count, sides, modifier)
    const rolls = attempts[0].dice

    return NextResponse.json({ rolls, total: result })
  } catch (err) {
    logger.error({ err }, '[POST /api/dice/roll] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
