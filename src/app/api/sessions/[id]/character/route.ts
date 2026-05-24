import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../lib/db'
import { characters } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolveSession } from '../../../../../lib/api/withSession'
import logger from '../../../../../lib/logger'

const EquipmentItemSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
})

const PatchBodySchema = z.union([
  // Clear creation rolls branch
  z.object({
    clearCreationRolls: z.literal(true),
  }),
  // Equipment update branch
  z.object({
    equipment: z.enum(['weapon', 'armour']),
    item: EquipmentItemSchema,
  }),
  // Stat delta branch
  z.object({
    stat: z.string().min(1),
    delta: z.number(),
    value: z.never().optional(),
    target: z.enum(['current', 'initial']).optional(),
  }),
  // Stat absolute value branch
  z.object({
    stat: z.string().min(1),
    value: z.number(),
    delta: z.never().optional(),
    target: z.enum(['current', 'initial']).optional(),
  }),
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params

    const ctx = await resolveSession(id)
    if (ctx instanceof NextResponse) return ctx
    const { session, character, gameSystem } = ctx
    const sessionId = session.id

    const parseResult = PatchBodySchema.safeParse(await request.json())
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.issues },
        { status: 400 },
      )
    }
    const body = parseResult.data

    const currentStats = character.stats as Record<string, unknown>
    const currentInitialStats = character.initialStats as Record<string, unknown>

    // --- Clear creation rolls branch ---
    if ('clearCreationRolls' in body && body.clearCreationRolls === true) {
      db.update(characters)
        .set({ creationRolls: null })
        .where(eq(characters.sessionId, sessionId))
        .run()
      return new NextResponse(null, { status: 204 })
    }

    // --- Equipment update branch ---
    if ('equipment' in body) {
      const { equipment, item } = body
      const newStats = { ...currentStats, [equipment]: item }
      db.update(characters).set({ stats: newStats }).where(eq(characters.sessionId, sessionId)).run()
      return NextResponse.json({ stats: newStats, initialStats: currentInitialStats })
    }

    // --- Stat adjustment branch ---
    // At this point body is narrowed to one of the stat variants (delta or value).
    const statBody = body as { stat: string; delta?: number; value?: number; target?: 'current' | 'initial' }
    const { stat, target } = statBody
    const delta = statBody.delta
    const absoluteValue = statBody.value

    const parsedTarget = target ?? 'current'

    const isDelta = typeof delta === 'number'
    const isAbsolute = typeof absoluteValue === 'number'

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

      // Invoke system hook for any post-stat-change side effects (e.g. GQ XP threshold)
      const hookResult = gameSystem.onStatChanged?.(stat, newStats, newInitialStats)
      if (hookResult?.initialDeltas) {
        for (const [key, delta] of Object.entries(hookResult.initialDeltas)) {
          const current = typeof newInitialStats[key] === 'number' ? (newInitialStats[key] as number) : 0
          newInitialStats = { ...newInitialStats, [key]: current + delta }
        }
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

      // Invoke system hook for any post-stat-change side effects (e.g. GQ LP-XP resync)
      const hookResult = gameSystem.onStatChanged?.(stat, newStats, newInitialStats)
      if (hookResult?.initialDeltas) {
        for (const [key, delta] of Object.entries(hookResult.initialDeltas)) {
          const current = typeof newInitialStats[key] === 'number' ? (newInitialStats[key] as number) : 0
          newInitialStats = { ...newInitialStats, [key]: current + delta }
        }
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
