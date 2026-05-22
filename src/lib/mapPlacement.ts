import type { Direction } from './db/schema'

export const DIRECTION_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  N:    { dx: 0,   dy: -120 },
  S:    { dx: 0,   dy: +120 },
  E:    { dx: +120, dy: 0   },
  W:    { dx: -120, dy: 0   },
  up:   { dx: +85, dy: -85  },
  down: { dx: +85, dy: +85  },
}

/** Perpendicular nudge axis for each direction. */
const PERPENDICULAR_AXIS: Record<Direction, 'x' | 'y'> = {
  N:    'x',
  S:    'x',
  E:    'y',
  W:    'y',
  up:   'x',
  down: 'x',
}

const COLLISION_RADIUS = 30
const NUDGE_STEP = 20
const MAX_NUDGE_ATTEMPTS = 5

function isOccupied(
  pos: { x: number; y: number },
  existingNodes: Array<{ x: number; y: number }>,
): boolean {
  return existingNodes.some(
    (n) => Math.hypot(n.x - pos.x, n.y - pos.y) < COLLISION_RADIUS,
  )
}

/**
 * Compute where a new node should be placed relative to a parent node in a
 * given direction. Includes collision detection with up to 5 nudge attempts
 * along the perpendicular axis.
 */
export function computeConnectedNodePosition(
  parent: { x: number; y: number },
  direction: Direction,
  existingNodes: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  const { dx, dy } = DIRECTION_OFFSETS[direction]
  const base = { x: parent.x + dx, y: parent.y + dy }

  if (!isOccupied(base, existingNodes)) return base

  const axis = PERPENDICULAR_AXIS[direction]

  for (let attempt = 1; attempt <= MAX_NUDGE_ATTEMPTS; attempt++) {
    // Alternate ±direction: 1 → +step, 2 → −step, 3 → +2·step, 4 → −2·step …
    const sign = attempt % 2 === 1 ? 1 : -1
    const magnitude = Math.ceil(attempt / 2) * NUDGE_STEP

    const nudgedPos = { ...base }
    nudgedPos[axis] = base[axis] + sign * magnitude

    if (!isOccupied(nudgedPos, existingNodes)) return nudgedPos
  }

  // All nudge attempts exhausted — place with overlap.
  return base
}
