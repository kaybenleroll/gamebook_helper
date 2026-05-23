import { NextRequest, NextResponse } from 'next/server'
import '../../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../../lib/game-systems/registry'
import { applyXpThreshold, xpToLpBonuses } from '../../../../../lib/game-systems/grail-quest'
import { db } from '../../../../../lib/db'
import { sessions, characters } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

interface EquipmentItem {
  name: string
  value: number
}

type PatchBody =
  | { stat: string; delta: number; target?: 'current' | 'initial'; value?: never; equipment?: never; clearCreationRolls?: never }
  | { stat: string; value: number; target?: 'current' | 'initial'; delta?: never; equipment?: never; clearCreationRolls?: never }
  | { equipment: 'weapon' | 'armour'; item: EquipmentItem; stat?: never; delta?: never; value?: never; clearCreationRolls?: never }
  | { clearCreationRolls: true; stat?: never; delta?: never; value?: never; equipment?: never }

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
    if (!character) return NextResponse.json({ error: 'Character not found' }, { status: 404 })

    let gameSystem
    try {
      gameSystem = gameSystemRegistry.get(session.gameSystemId)
    } catch {
      return NextResponse.json({ error: 'Unknown game system' }, { status: 500 })
    }

    const currentStats = character.stats as Record<string, unknown>
    const currentInitialStats = character.initialStats as Record<string, unknown>

    // --- Clear creation rolls branch ---
    if ((body as Record<string, unknown>).clearCreationRolls === true) {
      db.update(characters)
        .set({ creationRolls: null })
        .where(eq(characters.sessionId, sessionId))
        .run()
      return new NextResponse(null, { status: 204 })
    }

    // --- Equipment update branch ---
    if (body.equipment !== undefined) {
      const { equipment, item } = body as { equipment: unknown; item: unknown }
      if (equipment !== 'weapon' && equipment !== 'armour') {
        return NextResponse.json(
          { error: 'equipment must be "weapon" or "armour"' },
          { status: 400 },
        )
      }
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as Record<string, unknown>).name !== 'string' ||
        typeof (item as Record<string, unknown>).value !== 'number'
      ) {
        return NextResponse.json(
          { error: 'item must be { name: string, value: number }' },
          { status: 400 },
        )
      }
      const newStats = { ...currentStats, [equipment]: item }
      db.update(characters).set({ stats: newStats }).where(eq(characters.sessionId, sessionId)).run()
      return NextResponse.json({ stats: newStats, initialStats: currentInitialStats })
    }

    // --- Stat adjustment branch ---
    const { stat, delta, value: absoluteValue, target } = body as {
      stat?: unknown; delta?: unknown; value?: unknown; target?: unknown
    }

    if (!stat || typeof stat !== 'string') {
      return NextResponse.json({ error: 'stat (string) is required' }, { status: 400 })
    }

    const parsedTarget = (target as string | undefined) ?? 'current'
    if (parsedTarget !== 'current' && parsedTarget !== 'initial') {
      return NextResponse.json({ error: 'target must be "current" or "initial"' }, { status: 400 })
    }

    const isDelta = typeof delta === 'number'
    const isAbsolute = typeof absoluteValue === 'number'
    if (!isDelta && !isAbsolute) {
      return NextResponse.json(
        { error: 'delta (number) or value (number) is required' },
        { status: 400 },
      )
    }

    // Game-over guard — only blocks current stat writes, not initialStats
    if (parsedTarget === 'current') {
      const healthValue =
        typeof currentStats[gameSystem.primaryHealthStat] === 'number'
          ? (currentStats[gameSystem.primaryHealthStat] as number)
          : 0
      if (healthValue <= 0) {
        return NextResponse.json(
          { error: 'Session is game over — stat adjustment not allowed' },
          { status: 409 },
        )
      }
    }

    const statDef = gameSystem.stats.find((s) => s.key === stat)
    if (!statDef) {
      return NextResponse.json({ error: `Unknown stat: ${stat}` }, { status: 400 })
    }

    let newStats = { ...currentStats }
    let newInitialStats = { ...currentInitialStats }

    if (parsedTarget === 'current') {
      const currentValue =
        typeof currentStats[stat] === 'number' ? (currentStats[stat] as number) : statDef.min
      const rawValue = isDelta ? currentValue + (delta as number) : (absoluteValue as number)
      const newValue = Math.max(statDef.min, Math.min(statDef.max ?? Infinity, rawValue))
      newStats = { ...newStats, [stat]: newValue }

      // Apply XP threshold logic for Grail Quest
      if (session.gameSystemId === 'grail-quest' && stat === 'experiencePoints') {
        const result = applyXpThreshold(newStats, newInitialStats)
        newStats = result.stats
        newInitialStats = result.initialStats
      }
    } else {
      // target === 'initial'
      const currentInitialValue =
        typeof currentInitialStats[stat] === 'number'
          ? (currentInitialStats[stat] as number)
          : statDef.min
      const rawValue = isDelta ? currentInitialValue + (delta as number) : (absoluteValue as number)
      const newInitialValue = Math.max(statDef.min, Math.min(statDef.max ?? Infinity, rawValue))
      newInitialStats = { ...newInitialStats, [stat]: newInitialValue }

      // Resync lifePointsXpBonuses when lifePoints initial is manually changed
      if (session.gameSystemId === 'grail-quest' && stat === 'lifePoints') {
        const currentXp =
          typeof currentStats.experiencePoints === 'number'
            ? (currentStats.experiencePoints as number)
            : 0
        newInitialStats = { ...newInitialStats, lifePointsXpBonuses: xpToLpBonuses(currentXp) }
      }

      // Clamp current stat down if it exceeds the new initialStats value
      const currentStatValue =
        typeof currentStats[stat] === 'number' ? (currentStats[stat] as number) : statDef.min
      if (currentStatValue > newInitialValue) {
        newStats = { ...newStats, [stat]: newInitialValue }
      }
    }

    db.update(characters)
      .set({ stats: newStats, initialStats: newInitialStats })
      .where(eq(characters.sessionId, sessionId))
      .run()

    logger.debug({ sessionId }, 'stat updated')
    return NextResponse.json({ stats: newStats, initialStats: newInitialStats })
  } catch (err) {
    logger.error({ err }, '[PATCH /api/sessions/[id]/character] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
