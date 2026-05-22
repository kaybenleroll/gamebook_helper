import { notFound } from 'next/navigation'
import Link from 'next/link'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import CharacterSheet from './CharacterSheet'

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

  return (
    <main className="p-8">
      <div className="mb-6">
        <Link href="/sessions" className="text-sm text-blue-600 hover:underline">
          ← All adventures
        </Link>
        <h1 className="text-2xl font-bold mt-2">{session.bookTitle}</h1>
        <p className="text-gray-500">{gameSystem.name}</p>
      </div>

      <CharacterSheet
        sessionId={sessionId}
        stats={character.stats as Record<string, number>}
        initialStats={character.initialStats as Record<string, number>}
        statDefs={gameSystem.stats}
      />
    </main>
  )
}
