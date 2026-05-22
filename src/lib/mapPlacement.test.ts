import { describe, it, expect } from 'vitest'
import { computeConnectedNodePosition, DIRECTION_OFFSETS } from './mapPlacement'
import type { Direction } from './db/schema'

const parent = { x: 100, y: 100 }

describe('DIRECTION_OFFSETS', () => {
  it('N offset is (0, -120)', () => {
    expect(DIRECTION_OFFSETS.N).toEqual({ dx: 0, dy: -120 })
  })

  it('S offset is (0, +120)', () => {
    expect(DIRECTION_OFFSETS.S).toEqual({ dx: 0, dy: 120 })
  })

  it('E offset is (+120, 0)', () => {
    expect(DIRECTION_OFFSETS.E).toEqual({ dx: 120, dy: 0 })
  })

  it('W offset is (-120, 0)', () => {
    expect(DIRECTION_OFFSETS.W).toEqual({ dx: -120, dy: 0 })
  })

  it('up offset is (+85, -85)', () => {
    expect(DIRECTION_OFFSETS.up).toEqual({ dx: 85, dy: -85 })
  })

  it('down offset is (+85, +85)', () => {
    expect(DIRECTION_OFFSETS.down).toEqual({ dx: 85, dy: 85 })
  })
})

describe('computeConnectedNodePosition — cardinal offsets', () => {
  it('places node to the N', () => {
    const pos = computeConnectedNodePosition(parent, 'N', [])
    expect(pos).toEqual({ x: 100, y: -20 })
  })

  it('places node to the S', () => {
    const pos = computeConnectedNodePosition(parent, 'S', [])
    expect(pos).toEqual({ x: 100, y: 220 })
  })

  it('places node to the E', () => {
    const pos = computeConnectedNodePosition(parent, 'E', [])
    expect(pos).toEqual({ x: 220, y: 100 })
  })

  it('places node to the W', () => {
    const pos = computeConnectedNodePosition(parent, 'W', [])
    expect(pos).toEqual({ x: -20, y: 100 })
  })
})

describe('computeConnectedNodePosition — diagonal offsets', () => {
  it('places node up (NE diagonal)', () => {
    const pos = computeConnectedNodePosition(parent, 'up', [])
    expect(pos).toEqual({ x: 185, y: 15 })
  })

  it('places node down (SE diagonal)', () => {
    const pos = computeConnectedNodePosition(parent, 'down', [])
    expect(pos).toEqual({ x: 185, y: 185 })
  })
})

// Collision radius is 30px, nudge step is 20px.
// A node at nudge position N is blocked if any existing node is within 30px of it.
// Nudge candidates: attempt 1 = +20, attempt 2 = -20, attempt 3 = +40, attempt 4 = -40, attempt 5 = +60.
// To block nudge 1 (+20) without interference: place a blocker AT +20 (distance 0 < 30).
// To block nudge 2 (-20): place a blocker AT -20.
// Etc. Each blocker must be placed precisely at the nudge target, not at the base, to avoid
// contaminating other positions (since the base blocker is 20px from nudge 1, which IS < 30px).
describe('computeConnectedNodePosition — collision detection', () => {
  it('nudges along X axis (perpendicular to N/S) when base position is occupied', () => {
    const basePos = { x: 100, y: -20 }
    // Only block base; nudge 1 (+20 X = 120,-20) is 20px from base but 20 < 30 so also blocked.
    // So first clear nudge is attempt 2 (-20 X = 80,-20) which is also 20px from base and blocked.
    // First clear is attempt 3 (+40 X = 140,-20) which is 40px from base — clear.
    const existingNodes = [basePos]
    const pos = computeConnectedNodePosition(parent, 'N', existingNodes)
    // nudge 1 (+20) = 120,-20: distance from basePos = 20 < 30 → occupied
    // nudge 2 (-20) = 80,-20: distance from basePos = 20 < 30 → occupied
    // nudge 3 (+40) = 140,-20: distance from basePos = 40 ≥ 30 → free
    expect(pos).toEqual({ x: 140, y: -20 })
  })

  it('nudges along Y axis (perpendicular to E/W) when base position is occupied', () => {
    const basePos = { x: 220, y: 100 }
    const existingNodes = [basePos]
    const pos = computeConnectedNodePosition(parent, 'E', existingNodes)
    // nudge 1 (+20) = 220,120: distance from basePos = 20 < 30 → occupied
    // nudge 2 (-20) = 220,80: distance from basePos = 20 < 30 → occupied
    // nudge 3 (+40) = 220,140: distance from basePos = 40 ≥ 30 → free
    expect(pos).toEqual({ x: 220, y: 140 })
  })

  it('alternates ± direction on successive nudge attempts', () => {
    const basePos = { x: 100, y: -20 }
    // Block base + explicit blockers at nudge 1 and nudge 2 positions
    // Also note the base blocks nudge 1 and 2 via proximity (20 < 30).
    // Add explicit blocker at nudge 3 (+40 = 140,-20) to force nudge 4.
    const existingNodes = [
      basePos,
      { x: 140, y: -20 },  // nudge 3: +40 — block it
    ]
    const pos = computeConnectedNodePosition(parent, 'N', existingNodes)
    // nudge 1 (+20=120) blocked by base (20<30), nudge 2 (-20=80) blocked by base (20<30),
    // nudge 3 (+40=140) blocked by explicit blocker, nudge 4 (-40=60) free (60 from base, 80 from nudge3 blocker)
    expect(pos).toEqual({ x: 60, y: -20 })
  })

  it('places with overlap after 5 failed nudge attempts', () => {
    const basePos = { x: 100, y: -20 }
    // Block base and all 5 nudge positions precisely
    const existingNodes: Array<{ x: number; y: number }> = [
      basePos,
      { x: 120, y: -20 },  // nudge 1: +20
      { x: 80,  y: -20 },  // nudge 2: -20
      { x: 140, y: -20 },  // nudge 3: +40
      { x: 60,  y: -20 },  // nudge 4: -40
      { x: 160, y: -20 },  // nudge 5: +60
    ]
    const pos = computeConnectedNodePosition(parent, 'N', existingNodes)
    // Falls back to base position after all attempts exhausted
    expect(pos).toEqual(basePos)
  })

  it('nudges along X axis for up/down directions', () => {
    const direction: Direction = 'up'
    const basePos = { x: 185, y: 15 }
    const existingNodes = [basePos]
    const pos = computeConnectedNodePosition(parent, direction, existingNodes)
    // nudge 1 (+20 X = 205,15): distance from basePos = 20 < 30 → occupied
    // nudge 2 (-20 X = 165,15): distance from basePos = 20 < 30 → occupied
    // nudge 3 (+40 X = 225,15): distance from basePos = 40 ≥ 30 → free
    expect(pos).toEqual({ x: 225, y: 15 })
  })
})
