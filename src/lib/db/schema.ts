import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export type RollAttempt = { dice: number[]; total: number }
export type StatRollDetail = {
  attempts: RollAttempt[]
  best: number
  multiplier: number
  result: number
  statLabel: string
}
export type CreationRolls = Record<string, StatRollDetail>

export const combatOutcomeEnum = [
  'in_progress',
  'player_won',
  'player_lost',
  'player_fled',
] as const
export type CombatOutcomeValue = (typeof combatOutcomeEnum)[number]

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameSystemId: text('game_system_id').notNull(),
  bookTitle: text('book_title').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const characters = sqliteTable(
  'characters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    stats: text('stats', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    initialStats: text('initial_stats', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    creationRolls: text('creation_rolls', { mode: 'json' })
      .$type<CreationRolls | null>()
      .default(null),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('characters_session_id_idx').on(t.sessionId)],
)

export const LOCATION_TYPE_PRESETS = [
  'room',
  'corridor',
  'junction',
  'stairs',
  'outdoor',
  'cave',
  'town building',
  'clearing',
] as const
export type LocationTypePreset = (typeof LOCATION_TYPE_PRESETS)[number]

export const connectionTypeEnum = [
  'open',
  'door',
  'locked',
  'secret',
  'one_way',
  'blocked',
] as const
export type ConnectionType = (typeof connectionTypeEnum)[number]

export const directionEnum = ['N', 'S', 'E', 'W', 'up', 'down'] as const
export type Direction = (typeof directionEnum)[number]

export const maps = sqliteTable(
  'maps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('maps_session_id_idx').on(t.sessionId)],
)

export const mapNodes = sqliteTable(
  'map_nodes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mapId: integer('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    sectionNumber: integer('section_number'),
    locationType: text('location_type').notNull(),
    locationTypeCustom: text('location_type_custom'),
    notes: text('notes'),
    visited: integer('visited', { mode: 'boolean' }).notNull().default(false),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
    x: real('x').notNull(),
    y: real('y').notNull(),
  },
  (t) => [
    index('map_nodes_map_id_idx').on(t.mapId),
    // Partial unique index: only one current node per map (is_current = 1)
    uniqueIndex('map_nodes_current_idx').on(t.mapId).where(sql`is_current = 1`),
  ],
)

export const mapEdges = sqliteTable(
  'map_edges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mapId: integer('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    fromNodeId: integer('from_node_id')
      .notNull()
      .references(() => mapNodes.id, { onDelete: 'cascade' }),
    toNodeId: integer('to_node_id')
      .notNull()
      .references(() => mapNodes.id, { onDelete: 'cascade' }),
    // Cross-map target: deleting the target map deletes this edge entirely (cascade)
    targetMapId: integer('target_map_id')
      .references(() => maps.id, { onDelete: 'cascade' }),
    direction: text('direction', { enum: directionEnum }),
    connectionType: text('connection_type', { enum: connectionTypeEnum }).notNull(),
  },
  (t) => [index('map_edges_map_id_idx').on(t.mapId)],
)

export const combats = sqliteTable(
  'combats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    enemyName: text('enemy_name').notNull(),
    enemyStats: text('enemy_stats', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    enemyState: text('enemy_state', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    metadata: text('metadata', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    outcome: text('outcome', { enum: combatOutcomeEnum }).notNull().default('in_progress'),
    startedAt: integer('started_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
  },
  (t) => [index('combats_session_id_idx').on(t.sessionId)],
)

export const combatRounds = sqliteTable(
  'combat_rounds',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    combatId: integer('combat_id')
      .notNull()
      .references(() => combats.id),
    roundNumber: integer('round_number').notNull(),
    detail: text('detail', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull(),
    damageDealt: integer('damage_dealt').notNull(),
    damageTaken: integer('damage_taken').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('combat_rounds_combat_id_idx').on(t.combatId)],
)

export const sectionVisits = sqliteTable(
  'section_visits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    sectionNumber: integer('section_number').notNull(),
    visitedAt: integer('visited_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('section_visits_session_id_idx').on(t.sessionId)],
)

export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    name: text('name').notNull(),
    quantity: integer('quantity').notNull().default(1),
    isSpecial: integer('is_special', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('inventory_items_session_id_idx').on(t.sessionId)],
)
