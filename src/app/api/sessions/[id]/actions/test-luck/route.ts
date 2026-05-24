import { NextRequest, NextResponse } from 'next/server'
import '../../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../../lib/game-systems/registry'
import { db } from '../../../../../../lib/db'
import { sessions, characters } from '../../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import logger from '../../../../../../lib/logger'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

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
