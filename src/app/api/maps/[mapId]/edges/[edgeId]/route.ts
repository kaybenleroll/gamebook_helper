import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../../lib/db'
import { maps, mapEdges, directionEnum, connectionTypeEnum } from '../../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'

function formatEdge(edge: typeof mapEdges.$inferSelect) {
  return {
    id: edge.id,
    mapId: edge.mapId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    targetMapId: edge.targetMapId ?? null,
    direction: edge.direction ?? null,
    connectionType: edge.connectionType,
  }
}

const updateEdgeSchema = z
  .object({
    direction: z.enum(directionEnum).nullable().optional(),
    connectionType: z.enum(connectionTypeEnum).optional(),
  })
  .refine((data) => data.direction !== undefined || data.connectionType !== undefined, {
    message: 'At least one of direction or connectionType must be provided',
  })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mapId: string; edgeId: string }> },
): Promise<NextResponse> {
  try {
    const { mapId, edgeId } = await params
    const mapIdNum = parseInt(mapId, 10)
    const edgeIdNum = parseInt(edgeId, 10)

    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }
    if (isNaN(edgeIdNum)) {
      return NextResponse.json({ error: 'Invalid edge ID' }, { status: 400 })
    }

    // Verify the map exists
    const map = db.select().from(maps).where(eq(maps.id, mapIdNum)).get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    // Verify the edge exists and belongs to this map
    const existingEdge = db
      .select()
      .from(mapEdges)
      .where(and(eq(mapEdges.id, edgeIdNum), eq(mapEdges.mapId, mapIdNum)))
      .get()
    if (!existingEdge) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const parsed = updateEdgeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    // Build partial update — only include fields that were provided
    const updates: Partial<Pick<typeof mapEdges.$inferInsert, 'direction' | 'connectionType'>> = {}
    if (parsed.data.direction !== undefined) {
      updates.direction = parsed.data.direction
    }
    if (parsed.data.connectionType !== undefined) {
      updates.connectionType = parsed.data.connectionType
    }

    const result = db
      .update(mapEdges)
      .set(updates)
      .where(and(eq(mapEdges.id, edgeIdNum), eq(mapEdges.mapId, mapIdNum)))
      .returning()
      .get()

    return NextResponse.json(formatEdge(result), { status: 200 })
  } catch (err) {
    console.error('[PATCH /api/maps/[mapId]/edges/[edgeId]]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ mapId: string; edgeId: string }> },
): Promise<NextResponse> {
  try {
    const { mapId, edgeId } = await params
    const mapIdNum = parseInt(mapId, 10)
    const edgeIdNum = parseInt(edgeId, 10)

    if (isNaN(mapIdNum)) {
      return NextResponse.json({ error: 'Invalid map ID' }, { status: 400 })
    }
    if (isNaN(edgeIdNum)) {
      return NextResponse.json({ error: 'Invalid edge ID' }, { status: 400 })
    }

    // Verify the map exists
    const map = db.select().from(maps).where(eq(maps.id, mapIdNum)).get()
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 })
    }

    // Verify the edge exists and belongs to this map
    const existingEdge = db
      .select()
      .from(mapEdges)
      .where(and(eq(mapEdges.id, edgeIdNum), eq(mapEdges.mapId, mapIdNum)))
      .get()
    if (!existingEdge) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    db.delete(mapEdges).where(and(eq(mapEdges.id, edgeIdNum), eq(mapEdges.mapId, mapIdNum))).run()

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/maps/[mapId]/edges/[edgeId]]:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
