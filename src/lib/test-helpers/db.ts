/**
 * Test database helpers for integration tests.
 *
 * Creates an isolated in-memory SQLite database using the same Drizzle schema
 * as production, so tests exercise real SQL behaviour without touching the
 * production database file.
 *
 * Usage:
 *   vi.mock('@/lib/db', () => ({ db: createTestDb() }))
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import {
  sessions,
  characters,
  maps,
  combats,
  combatRounds,
  sectionVisits,
  inventoryItems,
  sessionSpells,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type TestDb = ReturnType<typeof drizzle>

/**
 * Creates an isolated in-memory SQLite database with the full application
 * schema applied and FK constraints enabled.
 *
 * Each call returns a fresh, independent database instance.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Apply schema DDL — mirrors the production schema exactly.
  // Using raw SQL rather than drizzle-kit push to avoid spawning a child
  // process inside the container's test runner.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      game_system_id TEXT NOT NULL,
      book_title TEXT NOT NULL,
      notes TEXT,
      panel_order TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      stats TEXT NOT NULL,
      initial_stats TEXT NOT NULL,
      creation_rolls TEXT DEFAULT 'null',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS characters_session_id_idx ON characters(session_id);

    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS maps_session_id_idx ON maps(session_id);

    CREATE TABLE IF NOT EXISTS map_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      map_id INTEGER NOT NULL,
      section_number INTEGER,
      location_type TEXT NOT NULL,
      location_type_custom TEXT,
      notes TEXT,
      visited INTEGER NOT NULL DEFAULT 0,
      is_current INTEGER NOT NULL DEFAULT 0,
      x REAL NOT NULL,
      y REAL NOT NULL,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS map_nodes_map_id_idx ON map_nodes(map_id);

    CREATE UNIQUE INDEX IF NOT EXISTS map_nodes_current_idx
      ON map_nodes(map_id) WHERE is_current = 1;

    CREATE TABLE IF NOT EXISTS map_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      map_id INTEGER NOT NULL,
      from_node_id INTEGER NOT NULL,
      to_node_id INTEGER NOT NULL,
      target_map_id INTEGER,
      direction TEXT,
      connection_type TEXT NOT NULL,
      FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
      FOREIGN KEY (from_node_id) REFERENCES map_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_node_id) REFERENCES map_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_map_id) REFERENCES maps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS map_edges_map_id_idx ON map_edges(map_id);

    CREATE TABLE IF NOT EXISTS combats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      enemy_name TEXT NOT NULL,
      enemy_stats TEXT NOT NULL,
      enemy_state TEXT NOT NULL,
      metadata TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'in_progress',
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS combats_session_id_idx ON combats(session_id);

    CREATE UNIQUE INDEX IF NOT EXISTS combats_active_session_uniq
      ON combats(session_id) WHERE outcome = 'in_progress';

    CREATE TABLE IF NOT EXISTS combat_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      combat_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      detail TEXT NOT NULL,
      damage_dealt INTEGER NOT NULL,
      damage_taken INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (combat_id) REFERENCES combats(id)
    );

    CREATE INDEX IF NOT EXISTS combat_rounds_combat_id_idx ON combat_rounds(combat_id);

    CREATE TABLE IF NOT EXISTS section_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      section_number INTEGER NOT NULL,
      visited_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS section_visits_session_id_idx ON section_visits(session_id);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      is_special INTEGER NOT NULL DEFAULT 0,
      item_type TEXT NOT NULL DEFAULT 'item',
      dose_count INTEGER,
      heal_amount INTEGER,
      heal_dice TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS inventory_items_session_id_idx ON inventory_items(session_id);

    CREATE TABLE IF NOT EXISTS session_spells (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id INTEGER NOT NULL,
      spell_id TEXT NOT NULL,
      uses_remaining INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS session_spells_session_id_idx ON session_spells(session_id);
  `)

  return drizzle(sqlite)
}

/**
 * Seeds a session with a full set of related rows for use in delete-cascade
 * tests.  Returns the IDs of all inserted rows so tests can assert they are
 * gone after a delete.
 */
export async function seedSessionWithRelatedData(testDb: TestDb): Promise<{
  sessionId: number
  characterId: number
  mapId: number
  combatId: number
  combatRoundId: number
  sectionVisitId: number
  inventoryItemId: number
  sessionSpellId: number
}> {
  // Insert session
  testDb.insert(sessions).values({
    gameSystemId: 'grail-quest',
    bookTitle: 'Test Book',
  }).run()

  const session = testDb
    .select()
    .from(sessions)
    .all()
    .at(-1)!
  const sessionId = session.id

  // Insert character
  testDb.insert(characters).values({
    sessionId,
    stats: { lifePoints: 12, experiencePoints: 0 },
    initialStats: { lifePoints: 12, lifePointsXpBonuses: 0 },
  }).run()

  const character = testDb
    .select()
    .from(characters)
    .where(eq(characters.sessionId, sessionId))
    .get()!
  const characterId = character.id

  // Insert map
  testDb.insert(maps).values({ sessionId, name: 'Test Map' }).run()

  const map = testDb
    .select()
    .from(maps)
    .where(eq(maps.sessionId, sessionId))
    .get()!
  const mapId = map.id

  // Insert combat
  testDb.insert(combats).values({
    sessionId,
    enemyName: 'Goblin',
    enemyStats: { stamina: 5 },
    enemyState: { currentStamina: 5 },
    metadata: { enemyXp: 2 },
    outcome: 'in_progress',
  }).run()

  const combat = testDb
    .select()
    .from(combats)
    .where(eq(combats.sessionId, sessionId))
    .get()!
  const combatId = combat.id

  // Insert combat round
  testDb.insert(combatRounds).values({
    combatId,
    roundNumber: 1,
    detail: { roll: 5 },
    damageDealt: 2,
    damageTaken: 1,
  }).run()

  const combatRound = testDb
    .select()
    .from(combatRounds)
    .where(eq(combatRounds.combatId, combatId))
    .get()!
  const combatRoundId = combatRound.id

  // Insert section visit
  testDb.insert(sectionVisits).values({ sessionId, sectionNumber: 42 }).run()

  const sectionVisit = testDb
    .select()
    .from(sectionVisits)
    .where(eq(sectionVisits.sessionId, sessionId))
    .get()!
  const sectionVisitId = sectionVisit.id

  // Insert inventory item
  testDb.insert(inventoryItems).values({ sessionId, name: 'Sword', quantity: 1 }).run()

  const inventoryItem = testDb
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.sessionId, sessionId))
    .get()!
  const inventoryItemId = inventoryItem.id

  // Insert session spell
  testDb.insert(sessionSpells).values({
    sessionId,
    spellId: 'fireball',
    usesRemaining: 3,
  }).run()

  const sessionSpell = testDb
    .select()
    .from(sessionSpells)
    .where(eq(sessionSpells.sessionId, sessionId))
    .get()!
  const sessionSpellId = sessionSpell.id

  return {
    sessionId,
    characterId,
    mapId,
    combatId,
    combatRoundId,
    sectionVisitId,
    inventoryItemId,
    sessionSpellId,
  }
}
