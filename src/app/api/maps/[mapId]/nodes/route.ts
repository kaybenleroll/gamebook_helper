import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../lib/db'
import { maps, mapNodes } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

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

const createNodeSchema = z.object({
  sectionNumber: z.number().int().positive().nullable().optional(),
  locationType: z.string().min(1),
  locationTypeCustom: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  visited: z.boolean().optional(),
  isCurrent: z.boolean().optional(),
  x: z.number(),
  y: z.number(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
): Promise<NextResponse> {
  try {
    const { mapId } = await params
    const mapIdNum = parseInt(mapId, 10)
    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.id, mapIdNum)).get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    const nodes = db
      .select()
      .from(mapNodes)
      .where(eq(mapNodes.mapId, mapIdNum))
      .orderBy(asc(mapNodes.id))
      .all()

    return NextResponse.json(nodes.map(formatNode))
  } catch (err) {
    console.error('[GET /api/maps/[mapId]/nodes]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string }> },
): Promise<NextResponse> {
  try {
    const { mapId } = await params
    const mapIdNum = parseInt(mapId, 10)
    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }

    const map = db.select().from(maps).where(eq(maps.id, mapIdNum)).get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const parsed = createNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { sectionNumber, locationType, locationTypeCustom, notes, visited, isCurrent, x, y } = parsed.data

    const result = db
      .insert(mapNodes)
      .values({
        mapId: mapIdNum,
        sectionNumber: sectionNumber ?? null,
        locationType,
        locationTypeCustom: locationTypeCustom ?? null,
        notes: notes ?? null,
        visited: visited ?? false,
        isCurrent: isCurrent ?? false,
        x,
        y,
      })
      .returning()
      .get()

    return NextResponse.json(formatNode(result), { status: 201 })
  } catch (err) {
    console.error('[POST /api/maps/[mapId]/nodes]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
