import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '../../../../../lib/db'
import { maps, mapNodes, mapEdges, directionEnum, connectionTypeEnum } from '../../../../../lib/db/schema'
import { eq, asc, and } from 'drizzle-orm'
import logger from '../../../../../lib/logger'

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

const createEdgeSchema = z.object({
  fromNodeId: z.number().int().positive(),
  toNodeId: z.number().int().positive(),
  direction: z.enum(directionEnum).nullable().optional(),
  connectionType: z.enum(connectionTypeEnum).optional(),
  targetMapId: z.number().int().positive().nullable().optional(),
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

    const edges = db
      .select()
      .from(mapEdges)
      .where(eq(mapEdges.mapId, mapIdNum))
      .orderBy(asc(mapEdges.id))
      .all()

    return NextResponse.json(edges.map(formatEdge))
  } catch (err) {
    logger.error({ err }, '[GET /api/maps/[mapId]/edges] error')
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
    const parsed = createEdgeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { fromNodeId, toNodeId, direction, connectionType, targetMapId } = parsed.data

    // Verify fromNodeId belongs to this map
    const fromNode = db
      .select()
      .from(mapNodes)
      .where(and(eq(mapNodes.id, fromNodeId), eq(mapNodes.mapId, mapIdNum)))
      .get()
    if (!fromNode) {
      return NextResponse.json({ error: 'fromNodeId not found in this map' }, { status: 404 })
    }

    // Verify toNodeId belongs to this map
    const toNode = db
      .select()
      .from(mapNodes)
      .where(and(eq(mapNodes.id, toNodeId), eq(mapNodes.mapId, mapIdNum)))
      .get()
    if (!toNode) {
      return NextResponse.json({ error: 'toNodeId not found in this map' }, { status: 404 })
    }

    const result = db
      .insert(mapEdges)
      .values({
        mapId: mapIdNum,
        fromNodeId,
        toNodeId,
        direction: direction ?? null,
        connectionType: connectionType ?? 'open',
        targetMapId: targetMapId ?? null,
      })
      .returning()
      .get()

    return NextResponse.json(formatEdge(result), { status: 201 })
  } catch (err) {
    logger.error({ err }, '[POST /api/maps/[mapId]/edges] error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
