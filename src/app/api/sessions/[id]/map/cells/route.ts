import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { maps, mapCells, cellStyleEnum } from '../../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const body = await request.json() as {
      x?: unknown; y?: unknown; cellStyle?: unknown;
      sectionNumber?: unknown; label?: unknown; notes?: unknown
    }
    const { x, y, cellStyle, sectionNumber, label, notes } = body

    if (typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json({ error: 'x and y (numbers) are required' }, { status: 400 })
    }
    if (!cellStyle || !cellStyleEnum.includes(cellStyle as typeof cellStyleEnum[number])) {
      return NextResponse.json({ error: `cellStyle must be one of: ${cellStyleEnum.join(', ')}` }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.sessionId, sessionId)).get()
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 })

    if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
      return NextResponse.json({ error: `Position out of bounds (map is ${map.width}×${map.height})` }, { status: 400 })
    }

    db.insert(mapCells)
      .values({
        mapId: map.id, x, y,
        cellStyle: cellStyle as typeof cellStyleEnum[number],
        sectionNumber: typeof sectionNumber === 'number' ? sectionNumber : null,
        label: typeof label === 'string' ? label : null,
        notes: typeof notes === 'string' ? notes : null,
      })
      .onConflictDoUpdate({
        target: [mapCells.mapId, mapCells.x, mapCells.y],
        set: {
          cellStyle: cellStyle as typeof cellStyleEnum[number],
          sectionNumber: typeof sectionNumber === 'number' ? sectionNumber : null,
          label: typeof label === 'string' ? label : null,
          notes: typeof notes === 'string' ? notes : null,
        },
      })
      .run()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
