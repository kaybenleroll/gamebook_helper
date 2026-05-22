import { describe, it, expect } from 'vitest'
import { worldToScreen, screenToWorld } from '../mapCoordinates'

describe('worldToScreen', () => {
  it('maps world origin to pan position at zoom 1', () => {
    expect(worldToScreen(0, 0, { x: 100, y: 200 }, 1)).toEqual({ x: 100, y: 200 })
  })

  it('applies zoom correctly', () => {
    expect(worldToScreen(10, 20, { x: 0, y: 0 }, 2)).toEqual({ x: 20, y: 40 })
  })

  it('combines pan and zoom', () => {
    expect(worldToScreen(10, 10, { x: 50, y: 50 }, 2)).toEqual({ x: 70, y: 70 })
  })

  it('handles negative world coordinates', () => {
    expect(worldToScreen(-5, -10, { x: 100, y: 100 }, 1)).toEqual({ x: 95, y: 90 })
  })

  it('handles zoom < 1', () => {
    const result = worldToScreen(100, 200, { x: 0, y: 0 }, 0.5)
    expect(result.x).toBeCloseTo(50)
    expect(result.y).toBeCloseTo(100)
  })
})

describe('screenToWorld', () => {
  it('inverts worldToScreen at zoom 1', () => {
    const pan = { x: 100, y: 200 }
    const zoom = 1
    const world = { x: 42, y: 77 }
    const screen = worldToScreen(world.x, world.y, pan, zoom)
    const result = screenToWorld(screen.x, screen.y, pan, zoom)
    expect(result.x).toBeCloseTo(world.x)
    expect(result.y).toBeCloseTo(world.y)
  })

  it('inverts worldToScreen at zoom 2', () => {
    const pan = { x: 50, y: 50 }
    const zoom = 2
    const world = { x: 30, y: -15 }
    const screen = worldToScreen(world.x, world.y, pan, zoom)
    const result = screenToWorld(screen.x, screen.y, pan, zoom)
    expect(result.x).toBeCloseTo(world.x)
    expect(result.y).toBeCloseTo(world.y)
  })

  it('inverts worldToScreen at zoom 0.5', () => {
    const pan = { x: 400, y: 300 }
    const zoom = 0.5
    const world = { x: 200, y: 100 }
    const screen = worldToScreen(world.x, world.y, pan, zoom)
    const result = screenToWorld(screen.x, screen.y, pan, zoom)
    expect(result.x).toBeCloseTo(world.x)
    expect(result.y).toBeCloseTo(world.y)
  })

  it('maps screen origin with no pan and zoom 1 to world origin', () => {
    expect(screenToWorld(0, 0, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0 })
  })
})
