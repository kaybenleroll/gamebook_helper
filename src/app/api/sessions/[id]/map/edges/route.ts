import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../../lib/db'
import { maps, mapEdges, passageTypeEnum } from '../../../../../../lib/db/schema'
import { and, eq } from 'drizzle-orm'

function isAdjacent(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1
}

function normaliseEdge(x1: number, y1: number, x2: number, y2: number) {
  if (x1 > x2 || (x1 === x2 && y1 > y2)) return { x1: x2, y1: y2, x2: x1, y2: y1 }
  return { x1, y1, x2, y2 }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const body = await request.json() as {
      x1?: unknown; y1?: unknown; x2?: unknown; y2?: unknown; passageType?: unknown
    }
    const { x1, y1, x2, y2, passageType } = body

    if (typeof x1 !== 'number' || typeof y1 !== 'number' ||
        typeof x2 !== 'number' || typeof y2 !== 'number') {
      return NextResponse.json({ error: 'x1, y1, x2, y2 (numbers) are required' }, { status: 400 })
    }
    if (!passageType || !passageTypeEnum.includes(passageType as typeof passageTypeEnum[number])) {
      return NextResponse.json({ error: `passageType must be one of: ${passageTypeEnum.join(', ')}` }, { status: 400 })
    }
    if (!isAdjacent(x1, y1, x2, y2)) {
      return NextResponse.json({ error: 'Cells must be adjacent (share a grid edge)' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.sessionId, sessionId)).get()
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 })

    const norm = normaliseEdge(x1, y1, x2, y2)

    db.insert(mapEdges)
      .values({ mapId: map.id, ...norm, passageType: passageType as typeof passageTypeEnum[number] })
      .onConflictDoUpdate({
        target: [mapEdges.mapId, mapEdges.x1, mapEdges.y1, mapEdges.x2, mapEdges.y2],
        set: { passageType: passageType as typeof passageTypeEnum[number] },
      })
      .run()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const sessionId = parseInt(id, 10)
    if (isNaN(sessionId)) return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const x1 = parseInt(searchParams.get('x1') ?? '', 10)
    const y1 = parseInt(searchParams.get('y1') ?? '', 10)
    const x2 = parseInt(searchParams.get('x2') ?? '', 10)
    const y2 = parseInt(searchParams.get('y2') ?? '', 10)
    if ([x1, y1, x2, y2].some(isNaN)) {
      return NextResponse.json({ error: 'x1, y1, x2, y2 query params required' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.sessionId, sessionId)).get()
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 })

    const norm = normaliseEdge(x1, y1, x2, y2)

    db.delete(mapEdges)
      .where(and(
        eq(mapEdges.mapId, map.id),
        eq(mapEdges.x1, norm.x1), eq(mapEdges.y1, norm.y1),
        eq(mapEdges.x2, norm.x2), eq(mapEdges.y2, norm.y2),
      ))
      .run()

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
