import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { characters } from '../../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveSession } from '../../../../../../lib/api/withSession'
import logger from '../../../../../../lib/logger'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, character, gameSystem } = ctx
    const sessionId = session.id

    if (typeof gameSystem.testLuck !== 'function') {
      return NextResponse.json(
        { error: 'This game system does not support the Test Your Luck mechanic' },
        { status: 400 },
      )
    }

    const currentStats = character.stats as Record<string, unknown>
    const currentInitialStats = character.initialStats as Record<string, unknown>

    const currentLuck =
      typeof currentStats['luck'] === 'number' ? (currentStats['luck'] as number) : 0
    if (currentLuck <= 0) {
      return NextResponse.json(
        { error: 'Cannot test luck: current Luck is 0' },
        { status: 409 },
      )
    }

    const result = gameSystem.testLuck(currentStats, currentInitialStats)

    const newStats = { ...currentStats, luck: result.newLuck }
    db.update(characters)
      .set({ stats: newStats })
      .where(eq(characters.sessionId, sessionId))
      .run()

    logger.debug({ sessionId, roll: result.roll, success: result.success }, 'luck test performed')

    return NextResponse.json({
      roll: result.roll,
      success: result.success,
      newLuck: result.newLuck,
      message: result.message,
      stats: newStats,
      initialStats: currentInitialStats,
    })
  } catch (err) {
    logger.error({ err }, '[POST /api/sessions/[id]/actions/test-luck] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
