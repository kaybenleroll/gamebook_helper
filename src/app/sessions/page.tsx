import Link from 'next/link'
import '../../lib/game-systems/index'
import { gameSystemRegistry } from '../../lib/game-systems/registry'
import { db } from '../../lib/db'
import { sessions } from '../../lib/db/schema'
import { desc } from 'drizzle-orm'
import SessionsListClient from './SessionsListClient'

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
      <SessionsListClient initialSessions={enriched} />
    </main>
  )
}
