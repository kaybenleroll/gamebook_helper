import Link from 'next/link'
import '../../lib/game-systems/index'
import { gameSystemRegistry } from '../../lib/game-systems/registry'
import { db } from '../../lib/db'
import { sessions } from '../../lib/db/schema'
import { desc } from 'drizzle-orm'

export default function SessionsPage() {
  const allSessions = db.select().from(sessions).orderBy(desc(sessions.updatedAt)).all()

  const enriched = allSessions.map((s) => {
    let gameSystemName = s.gameSystemId
    try { gameSystemName = gameSystemRegistry.get(s.gameSystemId).name } catch { /* unknown */ }
    return { ...s, gameSystemName }
  })

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Adventures</h1>
        <Link href="/sessions/new" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          New Adventure
        </Link>
      </div>
      {enriched.length === 0 ? (
        <p className="text-gray-600">No adventures yet. Start one above.</p>
      ) : (
        <ul className="space-y-3">
          {enriched.map((session) => (
            <li key={session.id}>
              <Link
                href={`/sessions/${session.id}`}
                className="block p-4 border rounded hover:bg-gray-50"
              >
                <div className="font-medium">{session.bookTitle}</div>
                <div className="text-sm text-gray-500">
                  {session.gameSystemName} &middot;{' '}
                  {session.createdAt instanceof Date
                    ? session.createdAt.toLocaleDateString('en-GB')
                    : new Date((session.createdAt as number) * 1000).toLocaleDateString('en-GB')}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
