import { notFound } from 'next/navigation'
import Link from 'next/link'
import '../../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../../lib/game-systems/registry'
import { db } from '../../../../lib/db'
import { sessions, sectionVisits, combats, combatRounds } from '../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

type SectionVisitEvent = {
  type: 'section_visit'
  sectionNumber: number
  visitedAt: string
}

type CombatEvent = {
  type: 'combat'
  enemyName: string
  outcome: string
  rounds: number
  startedAt: string
  finalEnemyLP?: number
}

type LogEvent = SectionVisitEvent | CombatEvent

function toIso(value: Date | number): string {
  if (value instanceof Date) return value.toISOString()
  return new Date((value as number) * 1000).toISOString()
}

function formatOutcome(outcome: string): string {
  switch (outcome) {
    case 'player_won': return 'Won'
    case 'player_lost': return 'Lost'
    case 'player_fled': return 'Fled'
    case 'in_progress': return 'In progress'
    default: return outcome
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default async function SessionLogPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sessionId = parseInt(id, 10)
  if (isNaN(sessionId)) return notFound()

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
  if (!session) return notFound()

  let gameSystem
  try {
    gameSystem = gameSystemRegistry.get(session.gameSystemId)
  } catch {
    return notFound()
  }

  const primaryEnemyHealthStat = gameSystem.combat?.primaryEnemyHealthStat

  const visits = db
    .select()
    .from(sectionVisits)
    .where(eq(sectionVisits.sessionId, sessionId))
    .orderBy(asc(sectionVisits.visitedAt))
    .all()

  const allCombats = db
    .select()
    .from(combats)
    .where(eq(combats.sessionId, sessionId))
    .orderBy(asc(combats.startedAt))
    .all()

  const visitEvents: LogEvent[] = visits.map((v) => ({
    type: 'section_visit' as const,
    sectionNumber: v.sectionNumber,
    visitedAt: toIso(v.visitedAt),
  }))

  const combatEvents: LogEvent[] = allCombats.map((c) => {
    const rounds = db
      .select({ id: combatRounds.id })
      .from(combatRounds)
      .where(eq(combatRounds.combatId, c.id))
      .all()

    const enemyState = c.enemyState as Record<string, unknown>
    const finalEnemyLP =
      primaryEnemyHealthStat &&
      typeof enemyState[primaryEnemyHealthStat] === 'number'
        ? (enemyState[primaryEnemyHealthStat] as number)
        : undefined

    const event: CombatEvent = {
      type: 'combat' as const,
      enemyName: c.enemyName,
      outcome: c.outcome,
      rounds: rounds.length,
      startedAt: toIso(c.startedAt),
    }

    if (finalEnemyLP !== undefined) {
      event.finalEnemyLP = finalEnemyLP
    }

    return event
  })

  const events = [...visitEvents, ...combatEvents].sort((a, b) => {
    const tsA = a.type === 'section_visit' ? a.visitedAt : a.startedAt
    const tsB = b.type === 'section_visit' ? b.visitedAt : b.startedAt
    return tsA.localeCompare(tsB)
  })

  return (
    <main className="p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/sessions" className="text-sm text-blue-600 hover:underline">
          ← All adventures
        </Link>
        <h1 className="text-2xl font-bold mt-2">{session.bookTitle}</h1>
        <p className="text-gray-500">{gameSystem.name}</p>
        <nav className="flex gap-4 mt-3 border-b border-gray-200 pb-2">
          <Link
            href={`/sessions/${sessionId}`}
            className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
          >
            Session
          </Link>
          <span
            className="text-sm font-semibold text-gray-900 border-b-2 border-gray-900 pb-1 -mb-3"
          >
            Log
          </span>
        </nav>
      </div>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events recorded yet.</p>
      ) : (
        <ol className="relative border-l border-gray-200 ml-3">
          {events.map((event, index) => {
            if (event.type === 'section_visit') {
              return (
                <li key={index} className="mb-6 ml-6">
                  <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 ring-4 ring-white">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                  </span>
                  <p className="text-xs text-gray-400 mb-1">{formatTimestamp(event.visitedAt)}</p>
                  <p className="text-sm font-medium text-gray-900">
                    Visited section{' '}
                    <span className="font-bold">{event.sectionNumber}</span>
                  </p>
                </li>
              )
            }

            const outcomeColour =
              event.outcome === 'player_won'
                ? 'text-green-700'
                : event.outcome === 'player_lost'
                  ? 'text-red-700'
                  : event.outcome === 'player_fled'
                    ? 'text-amber-700'
                    : 'text-gray-700'

            return (
              <li key={index} className="mb-6 ml-6">
                <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-red-100 ring-4 ring-white">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                </span>
                <p className="text-xs text-gray-400 mb-1">{formatTimestamp(event.startedAt)}</p>
                <p className="text-sm font-medium text-gray-900">
                  Combat vs{' '}
                  <span className="font-bold">{event.enemyName}</span>
                </p>
                <p className="text-sm text-gray-600">
                  <span className={`font-semibold ${outcomeColour}`}>
                    {formatOutcome(event.outcome)}
                  </span>
                  {' · '}
                  {event.rounds} {event.rounds === 1 ? 'round' : 'rounds'}
                  {event.finalEnemyLP !== undefined && (
                    <span className="ml-2 text-gray-400">
                      (enemy LP remaining: {event.finalEnemyLP})
                    </span>
                  )}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
