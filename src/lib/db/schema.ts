import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameSystemId: text('game_system_id').notNull(),
  bookTitle: text('book_title').notNull(),
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
      .$type<Record<string, number>>()
      .notNull(),
    initialStats: text('initial_stats', { mode: 'json' })
      .$type<Record<string, number>>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('characters_session_id_idx').on(t.sessionId)],
)

export const maps = sqliteTable(
  'maps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('maps_session_id_idx').on(t.sessionId)],
)

export const cellStyleEnum = [
  'enclosed',
  'open',
  'path',
  'water',
  'barrier',
  'unknown',
] as const
export type CellStyle = (typeof cellStyleEnum)[number]

export const mapCells = sqliteTable(
  'map_cells',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mapId: integer('map_id')
      .notNull()
      .references(() => maps.id),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    cellStyle: text('cell_style', { enum: cellStyleEnum }).notNull(),
    sectionNumber: integer('section_number'),
    label: text('label'),
    notes: text('notes'),
  },
  (t) => [
    index('map_cells_map_id_idx').on(t.mapId),
    uniqueIndex('map_cells_position_idx').on(t.mapId, t.x, t.y),
  ],
)

export const passageTypeEnum = [
  'open',
  'door',
  'secret',
  'locked',
  'one_way',
  'blocked',
] as const
export type PassageType = (typeof passageTypeEnum)[number]

export const mapEdges = sqliteTable(
  'map_edges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mapId: integer('map_id')
      .notNull()
      .references(() => maps.id),
    x1: integer('x1').notNull(),
    y1: integer('y1').notNull(),
    x2: integer('x2').notNull(),
    y2: integer('y2').notNull(),
    passageType: text('passage_type', { enum: passageTypeEnum }).notNull(),
  },
  (t) => [
    index('map_edges_map_id_idx').on(t.mapId),
    uniqueIndex('map_edges_position_idx').on(t.mapId, t.x1, t.y1, t.x2, t.y2),
  ],
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
