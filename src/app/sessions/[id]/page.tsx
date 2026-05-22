import { notFound } from 'next/navigation'
import Link from 'next/link'
import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import { db } from '../../../lib/db'
import { sessions, characters } from '../../../lib/db/schema'
import { eq } from 'drizzle-orm'

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

      <section>
        <h2 className="text-lg font-semibold mb-3">Character Sheet</h2>
        <table className="border-collapse w-full max-w-md">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-8 font-medium">Stat</th>
              <th className="py-2 pr-8 font-medium text-right">Current</th>
              <th className="py-2 font-medium text-right">Starting</th>
            </tr>
          </thead>
          <tbody>
            {gameSystem.stats.map((stat) => (
              <tr key={stat.key} className="border-b last:border-0">
                <td className="py-2 pr-8">{stat.label}</td>
                <td className="py-2 pr-8 text-right font-mono">
                  {character.stats[stat.key] ?? stat.min}
                </td>
                <td className="py-2 text-right font-mono text-gray-500">
                  {character.initialStats[stat.key] ?? stat.min}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
