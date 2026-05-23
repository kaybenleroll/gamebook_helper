import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { maps, mapNodes } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import logger from '../../../../../../lib/logger'

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

const patchNodeSchema = z.object({
  sectionNumber: z.number().int().positive().nullable().optional(),
  locationType: z.string().min(1).optional(),
  locationTypeCustom: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  visited: z.boolean().optional(),
  isCurrent: z.boolean().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
}).strict()

export async function PATCH(
  request: NextRequest,
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

    const body: unknown = await request.json()
    const parsed = patchNodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    db.update(mapNodes)
      .set(parsed.data)
      .where(and(eq(mapNodes.id, nodeIdNum), eq(mapNodes.mapId, mapIdNum)))
      .run()

    const updated = db
      .select()
      .from(mapNodes)
      .where(and(eq(mapNodes.id, nodeIdNum), eq(mapNodes.mapId, mapIdNum)))
      .get()!

    return NextResponse.json(formatNode(updated))
  } catch (err) {
    logger.error({ err }, '[PATCH /api/maps/[mapId]/nodes/[nodeId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    // FK cascade (foreign_keys = ON) handles connected map_edges automatically.
    db.delete(mapNodes)
      .where(and(eq(mapNodes.id, nodeIdNum), eq(mapNodes.mapId, mapIdNum)))
      .run()

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    logger.error({ err }, '[DELETE /api/maps/[mapId]/nodes/[nodeId]] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
