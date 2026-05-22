import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../../../lib/db'
import { maps, mapCells } from '../../../../../../../../lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; x: string; y: string }> },
): Promise<NextResponse> {
  try {
    const { id, x: xStr, y: yStr } = await params
    const sessionId = parseInt(id, 10)
    const x = parseInt(xStr, 10)
    const y = parseInt(yStr, 10)
    if (isNaN(sessionId) || isNaN(x) || isNaN(y)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.sessionId, sessionId)).get()
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 })

    db.delete(mapCells)
      .where(and(eq(mapCells.mapId, map.id), eq(mapCells.x, x), eq(mapCells.y, y)))
      .run()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
