import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import logger from './logger'

const sqlite = new Database(process.env.DATABASE_URL ?? '/app/data/gamebook.db')

// SQLite does not enforce FK constraints by default — required for cascade deletes.
sqlite.pragma('foreign_keys = ON')

// Partial unique index: at most one active combat per session.
// Drizzle schema DSL does not support WHERE clauses on indexes, so we run
// this as a one-off idempotent statement at startup.
sqlite.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS combats_active_session_uniq
  ON combats (session_id)
  WHERE outcome = 'in_progress'
`)

// ---------------------------------------------------------------------------
// Schema drift guard — runs at module load time, before any request is served.
//
// Compares the live DB column list against the expected columns derived from
// the Drizzle schema definition.  If any expected column is absent the process
// throws immediately with a clear remediation message rather than letting the
// first affected request surface a cryptic SqliteError.
//
// Extend EXPECTED_COLUMNS whenever a new table or column is added to the
// Drizzle schema.
// ---------------------------------------------------------------------------

type ColumnSpec = { table: string; columns: string[] }

const EXPECTED_COLUMNS: ColumnSpec[] = [
  {
    table: 'sessions',
    columns: ['id', 'game_system_id', 'book_title', 'notes', 'panel_order', 'created_at', 'updated_at'],
  },
  {
    table: 'characters',
    columns: ['id', 'session_id', 'stats', 'initial_stats', 'creation_rolls', 'created_at'],
  },
  {
    table: 'maps',
    columns: ['id', 'session_id', 'name', 'created_at'],
  },
  {
    table: 'map_nodes',
    columns: [
      'id', 'map_id', 'section_number', 'location_type', 'location_type_custom',
      'notes', 'visited', 'is_current', 'x', 'y',
    ],
  },
  {
    table: 'map_edges',
    columns: ['id', 'map_id', 'from_node_id', 'to_node_id', 'target_map_id', 'direction', 'connection_type'],
  },
  {
    table: 'combats',
    columns: [
      'id', 'session_id', 'enemy_name', 'enemy_stats', 'enemy_state',
      'metadata', 'outcome', 'started_at', 'ended_at',
    ],
  },
  {
    table: 'combat_rounds',
    columns: ['id', 'combat_id', 'round_number', 'detail', 'damage_dealt', 'damage_taken', 'created_at'],
  },
  {
    table: 'section_visits',
    columns: ['id', 'session_id', 'section_number', 'visited_at'],
  },
  {
    table: 'inventory_items',
    columns: [
      'id', 'session_id', 'name', 'quantity', 'is_special',
      'item_type', 'dose_count', 'heal_amount', 'heal_dice', 'created_at',
    ],
  },
  {
    table: 'session_spells',
    columns: ['id', 'session_id', 'spell_id', 'uses_remaining'],
  },
]

function assertSchemaUpToDate(db: Database.Database): void {
  // PRAGMA table_list returns nothing for tables that do not exist yet (fresh
  // install before db:push).  We only validate tables that are already present
  // so a fresh empty DB doesn't false-positive.  Missing tables are silently
  // skipped — if a table is entirely absent that will surface at first use.
  for (const { table, columns } of EXPECTED_COLUMNS) {
    const rows = db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>

    if (rows.length === 0) {
      // Table does not exist yet — db:push has not been run.  Skip rather than
      // throwing; the first query will fail with a clear "no such table" message
      // which is sufficient for a fresh install.
      continue
    }

    const present = new Set(rows.map((r) => r.name))

    for (const col of columns) {
      if (!present.has(col)) {
        throw new Error(
          `Database schema is out of date. ` +
          `Column "${col}" is missing from table "${table}". ` +
          `Run \`just db-reset\` to rebuild the database schema.`,
        )
      }
    }
  }
}

assertSchemaUpToDate(sqlite)

export const db = drizzle(sqlite, {
  logger: {
    logQuery(query: string, params: unknown[]) {
      logger.debug({ query, params }, 'db query')
    },
  },
})
