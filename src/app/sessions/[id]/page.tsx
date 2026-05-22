import { notFound } from 'next/navigation'
import Link from 'next/link'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters, sectionVisits, combats, combatRounds, inventoryItems } from '../../../lib/db/schema'
import type { CreationRolls } from '../../../lib/db/schema'
import { eq, asc, desc } from 'drizzle-orm'
import SessionClient from './SessionClient'
import DiceRoller from './DiceRoller'
import MapGrid from './MapGrid'
import Notes from './Notes'
import SectionTracker from './SectionTracker'
import InventoryPanel from './InventoryPanel'

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sessionId = parseInt(id, 10)
  if (isNaN(sessionId)) return notFound()

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!session) return notFound()

  const character = db.select().from(characters).where(eq(characters.sessionId, sessionId)).get()
  if (!character) return notFound()

  let gameSystem
  try {
    gameSystem = gameSystemRegistry.get(session.gameSystemId)
  } catch {
    return notFound()
  }

  const stats = character.stats as Record<string, unknown>
  const isGameOver = ((stats[gameSystem.primaryHealthStat] as number | undefined) ?? 0) <= 0

  const sectionHistory = db
    .select()
    .from(sectionVisits)
    .where(eq(sectionVisits.sessionId, sessionId))
    .orderBy(asc(sectionVisits.visitedAt))
    .all()

  const currentSection = sectionHistory.length > 0
    ? sectionHistory[sectionHistory.length - 1].sectionNumber
    : null

  const sectionHistoryForClient = sectionHistory.map((v) => ({
    sectionNumber: v.sectionNumber,
    visitedAt: v.visitedAt instanceof Date
      ? v.visitedAt.toISOString()
      : new Date((v.visitedAt as number) * 1000).toISOString(),
  }))

  // Fetch active combat for this session
  const activeCombat = db
    .select()
    .from(combats)
    .where(eq(combats.sessionId, sessionId))
    .orderBy(desc(combats.startedAt))
    .all()
    .find((c) => c.outcome === 'in_progress') ?? null

  let activeCombatWithRounds = null
  if (activeCombat) {
    const rounds = db
      .select()
      .from(combatRounds)
      .where(eq(combatRounds.combatId, activeCombat.id))
      .orderBy(asc(combatRounds.roundNumber))
      .all()

    const formatTs = (v: Date | number | null) => {
      if (!v) return null
      if (v instanceof Date) return v.toISOString()
      return new Date((v as number) * 1000).toISOString()
    }

    const availableRoundOptions =
      activeCombat.outcome === 'in_progress' && gameSystem.combat
        ? gameSystem.combat.roundOptions({
            enemyStats: activeCombat.enemyStats,
            enemyState: activeCombat.enemyState,
            metadata: activeCombat.metadata,
            characterStats: stats,
          })
        : []

    activeCombatWithRounds = {
      id: activeCombat.id,
      sessionId: activeCombat.sessionId,
      enemyName: activeCombat.enemyName,
      enemyStats: activeCombat.enemyStats as Record<string, unknown>,
      enemyState: activeCombat.enemyState as Record<string, unknown>,
      metadata: activeCombat.metadata as Record<string, unknown>,
      outcome: activeCombat.outcome,
      startedAt: formatTs(activeCombat.startedAt)!,
      endedAt: formatTs(activeCombat.endedAt),
      availableRoundOptions,
      rounds: rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        detail: r.detail as Record<string, unknown>,
        damageDealt: r.damageDealt,
        damageTaken: r.damageTaken,
        createdAt: formatTs(r.createdAt)!,
      })),
    }
  }

  const inventoryForClient = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.sessionId, sessionId))
    .orderBy(asc(inventoryItems.createdAt))
    .all()
    .map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      name: item.name,
      quantity: item.quantity,
      isSpecial: item.isSpecial,
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : new Date((item.createdAt as number) * 1000).toISOString(),
    }))

  return (
    <main className="p-8">
      <div className="mb-6">
        <Link href="/sessions" className="text-sm text-blue-600 hover:underline">
          ← All adventures
        </Link>
        <h1 className="text-2xl font-bold mt-2">{session.bookTitle}</h1>
        <p className="text-gray-500">{gameSystem.name}</p>
      </div>

      {isGameOver && (
        <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded">
          <p className="font-bold text-red-700 text-lg">Game Over</p>
          <p className="text-red-600 mt-1">Your adventure has ended.</p>
          <Link href="/sessions/new" className="inline-block mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            Start new adventure
          </Link>
        </div>
      )}

      <SessionClient
        sessionId={sessionId}
        stats={stats}
        initialStats={character.initialStats as Record<string, unknown>}
        statDefs={gameSystem.stats}
        gameSystemId={session.gameSystemId}
        isGameOver={isGameOver}
        initialCombat={activeCombatWithRounds}
        enemyStatFields={gameSystem.combat?.enemyStatFields ?? null}
        primaryHealthStat={gameSystem.primaryHealthStat}
        primaryEnemyHealthStat={gameSystem.combat?.primaryEnemyHealthStat ?? ''}
        creationRolls={(character.creationRolls as CreationRolls | null) ?? null}
      />
      <DiceRoller defaultDice={gameSystem.defaultDice} />
      <SectionTracker
        sessionId={sessionId}
        initialCurrentSection={currentSection}
        initialHistory={sectionHistoryForClient}
      />
      <InventoryPanel
        sessionId={sessionId}
        gameSystemId={session.gameSystemId}
        initialItems={inventoryForClient}
      />
      <Notes sessionId={sessionId} initialNotes={session.notes ?? null} />
      <MapGrid sessionId={sessionId} />
    </main>
  )
}
