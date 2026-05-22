/**
 * Pure coordinate-transformation helpers for the SVG map canvas.
 *
 * World coordinates: the logical space where nodes live.
 * Screen coordinates: pixels on screen (the SVG viewport).
 *
 * Transform:  screen = world * zoom + pan
 * Inverse:    world  = (screen - pan) / zoom
 */

export interface Pan {
  x: number
  y: number
}

/**
 * Convert a world-space point to screen (SVG viewport) space.
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  pan: Pan,
  zoom: number,
): { x: number; y: number } {
  return {
    x: worldX * zoom + pan.x,
    y: worldY * zoom + pan.y,
  }
}

/**
 * Convert a screen-space point to world space.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  pan: Pan,
  zoom: number,
): { x: number; y: number } {
  return {
    x: (screenX - pan.x) / zoom,
    y: (screenY - pan.y) / zoom,
  }
}
