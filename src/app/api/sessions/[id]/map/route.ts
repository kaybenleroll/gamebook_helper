import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../lib/db'
import { maps, mapCells, mapEdges } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const map = db.select().from(maps).where(eq(maps.sessionId, sessionId)).get()
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 })

    const cells = db.select().from(mapCells).where(eq(mapCells.mapId, map.id)).all()
    const edges = db.select().from(mapEdges).where(eq(mapEdges.mapId, map.id)).all()

    return NextResponse.json({
      id: map.id,
      width: map.width,
      height: map.height,
      cells: cells.map((c) => ({
        x: c.x, y: c.y, cellStyle: c.cellStyle,
        sectionNumber: c.sectionNumber, label: c.label, notes: c.notes,
      })),
      edges: edges.map((e) => ({
        x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, passageType: e.passageType,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
