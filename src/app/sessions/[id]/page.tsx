import { notFound } from 'next/navigation'
import Link from 'next/link'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import CharacterSheet from './CharacterSheet'
import DiceRoller from './DiceRoller'
import MapGrid from './MapGrid'

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

  const stats = character.stats as Record<string, number>
  const isGameOver = (stats[gameSystem.primaryHealthStat] ?? 0) <= 0

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

      <CharacterSheet
        sessionId={sessionId}
        stats={stats}
        initialStats={character.initialStats as Record<string, number>}
        statDefs={gameSystem.stats}
        isGameOver={isGameOver}
      />
      <DiceRoller defaultDice={gameSystem.defaultDice} />
      <MapGrid sessionId={sessionId} />
    </main>
  )
}
