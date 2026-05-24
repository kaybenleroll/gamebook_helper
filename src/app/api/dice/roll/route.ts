import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rollDice, parseDiceFormula } from '../../../../lib/dice'
import logger from '../../../../lib/logger'

const RollDiceSchema = z.object({
  formula: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parseResult = RollDiceSchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const { formula } = parseResult.data

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
