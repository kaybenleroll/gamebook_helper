import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../../lib/db'
import { maps, mapNodes } from '../../../../../../../lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'

function formatNode(node: typeof mapNodes.$inferSelect) {
  return {
    id: node.id,
    mapId: node.mapId,
    sectionNumber: node.sectionNumber,
    locationType: node.locationType,
    locationTypeCustom: node.locationTypeCustom,
    notes: node.notes,
    visited: node.visited,
    isCurrent: node.isCurrent,
    x: node.x,
    y: node.y,
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string; nodeId: string }> },
): Promise<NextResponse> {
  try {
    const { mapId, nodeId } = await params
    const mapIdNum = parseInt(mapId, 10)
    const nodeIdNum = parseInt(nodeId, 10)

    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }
    if (isNaN(nodeIdNum)) {
      return NextResponse.json({ error: 'Invalid node ID' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.id, mapIdNum)).get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    const node = db
      .select()
      .from(mapNodes)
      .where(and(eq(mapNodes.id, nodeIdNum), eq(mapNodes.mapId, mapIdNum)))
      .get()
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Atomically clear all is_current flags then set the target.
    // The partial unique index (is_current = 1 per map) requires the clear
    // to happen before the set within the same transaction.
    db.transaction((tx) => {
      tx.update(mapNodes)
        .set({ isCurrent: false })
        .where(eq(mapNodes.mapId, mapIdNum))
        .run()

      tx.update(mapNodes)
        .set({ isCurrent: true })
        .where(and(eq(mapNodes.id, nodeIdNum), eq(mapNodes.mapId, mapIdNum)))
        .run()
    })

    const nodes = db
      .select()
      .from(mapNodes)
      .where(eq(mapNodes.mapId, mapIdNum))
      .orderBy(asc(mapNodes.id))
      .all()

    return NextResponse.json(nodes.map(formatNode))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
