/**
 * Integration tests for ON DELETE CASCADE FK constraints at the database layer.
 *
 * These tests bypass the API route entirely and operate directly on the
 * in-memory SQLite database, verifying that deleting a session row causes the
 * DB engine itself (not application code) to remove all child rows.
 *
 * This guards against regressions where cascade constraints are accidentally
 * removed from the schema — the DB layer is the final safety net.
 */

import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  sessions,
  characters,
  combats,
  combatRounds,
  sectionVisits,
  inventoryItems,
  sessionSpells,
} from '@/lib/db/schema'
import { createTestDb, seedSessionWithRelatedData } from '@/lib/test-helpers/db'

describe('ON DELETE CASCADE — session-scoped foreign keys', () => {
  it('deleting a session removes all child rows via DB cascade (no application logic)', async () => {
    const db = createTestDb()
    const seeded = await seedSessionWithRelatedData(db)
    const { sessionId, combatId } = seeded

    // Delete the parent session directly — no application logic involved.
    db.delete(sessions).where(eq(sessions.id, sessionId)).run()

    // Assert all child tables are empty for this session.
    expect(db.select().from(sessions).where(eq(sessions.id, sessionId)).all()).toHaveLength(0)
    expect(db.select().from(characters).where(eq(characters.sessionId, sessionId)).all()).toHaveLength(0)
    expect(db.select().from(combats).where(eq(combats.sessionId, sessionId)).all()).toHaveLength(0)
    expect(db.select().from(combatRounds).where(eq(combatRounds.combatId, combatId)).all()).toHaveLength(0)
    expect(db.select().from(sectionVisits).where(eq(sectionVisits.sessionId, sessionId)).all()).toHaveLength(0)
    expect(db.select().from(inventoryItems).where(eq(inventoryItems.sessionId, sessionId)).all()).toHaveLength(0)
    expect(db.select().from(sessionSpells).where(eq(sessionSpells.sessionId, sessionId)).all()).toHaveLength(0)
  })

  it('cascade does not affect rows belonging to a different session', async () => {
    const db = createTestDb()
    const first = await seedSessionWithRelatedData(db)
    const second = await seedSessionWithRelatedData(db)

    // Delete only the first session.
    db.delete(sessions).where(eq(sessions.id, first.sessionId)).run()

    // Second session and its child rows must be untouched.
    expect(db.select().from(sessions).where(eq(sessions.id, second.sessionId)).all()).toHaveLength(1)
    expect(db.select().from(characters).where(eq(characters.sessionId, second.sessionId)).all()).toHaveLength(1)
    expect(db.select().from(combats).where(eq(combats.sessionId, second.sessionId)).all()).toHaveLength(1)
    expect(db.select().from(combatRounds).where(eq(combatRounds.combatId, second.combatId)).all()).toHaveLength(1)
    expect(db.select().from(inventoryItems).where(eq(inventoryItems.sessionId, second.sessionId)).all()).toHaveLength(1)
    expect(db.select().from(sessionSpells).where(eq(sessionSpells.sessionId, second.sessionId)).all()).toHaveLength(1)
  })
})
