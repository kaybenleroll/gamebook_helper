import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

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

export const db = drizzle(sqlite)
