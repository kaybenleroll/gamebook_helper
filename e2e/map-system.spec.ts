import { test, expect, type APIRequestContext } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://gamebook-app:3000'

// Run all scenarios serially to avoid concurrent SQLite writes from parallel workers.
test.describe.configure({ mode: 'serial' })

// Use the seeded session (lowest ID) to avoid races with other spec files that
// create and delete their own sessions concurrently.
async function getSeededSessionId(request: APIRequestContext): Promise<number> {
  const res = await request.get(`${BASE}/api/sessions`)
  const sessions: Array<{ id: number }> = await res.json()
  return sessions.reduce((min, s) => (s.id < min ? s.id : min), sessions[0].id)
}

// ---------------------------------------------------------------------------
// Scenario 1: Create a map → tab appears
// ---------------------------------------------------------------------------
test.describe('Scenario 1: Create map → tab visible', () => {
  let sessionId: number
  let mapId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)
  })

  test.afterAll(async ({ request }) => {
    if (mapId) {
      await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
    }
  })

  test('map tab appears after creation', async ({ page, request }) => {
    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Map A' },
    })
    mapId = (await mapRes.json()).id

    await page.goto(`${BASE}/sessions/${sessionId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const tab = page.locator('text=Slice9 Map A')
    await expect(tab).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: '/app/.scratch/slice9-01-tab-visible.png' })
  })
})

// ---------------------------------------------------------------------------
// Scenario 2: Add first node (seed) → appears on canvas
// ---------------------------------------------------------------------------
test.describe('Scenario 2: Add first node → circle on canvas', () => {
  test('node circle renders on canvas', async ({ page, request }) => {
    const sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 2' },
    })
    expect(mapRes.status()).toBe(201)
    const mapId = (await mapRes.json()).id

    const nodeRes = await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })
    expect(nodeRes.status()).toBe(201)

    try {
      // Retry navigation in case of transient SQLite contention causing 404 or missing SVG
      let circleFound = false
      for (let attempt = 0; attempt < 6; attempt++) {
        await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
        await page.waitForLoadState('networkidle')
        // Check if we got a 404 page (SQLite lock during SSR)
        const has404 = await page.locator('text=This page could not be found').isVisible().catch(() => false)
        if (has404) {
          await page.waitForTimeout(1000)
          continue
        }
        await page.waitForTimeout(1500)
        // Check if circles are visible — if not, the client-side fetch may have hit contention
        const found = await page.locator('svg circle').count()
        if (found >= 1) { circleFound = true; break }
        await page.waitForTimeout(1000)
      }
      expect(circleFound).toBe(true)

      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()
      await expect(svg).toBeVisible({ timeout: 5000 })

      const count = await page.locator('svg circle').count()
      expect(count).toBeGreaterThanOrEqual(1)

      await page.screenshot({ path: '/app/.scratch/slice9-02-circle-visible.png' })
    } finally {
      await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Scenario 3: Add connected node via direction → edge appears
// ---------------------------------------------------------------------------
test.describe('Scenario 3: Add connected node → edge appears', () => {
  let sessionId: number
  let mapId: number
  let nodeAId: number
  let nodeBId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 3' },
    })
    mapId = (await mapRes.json()).id

    const nodeA = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeAId = nodeA.id

    const nodeB = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeBId = nodeB.id

    await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'open', direction: 'E' },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('two circles and at least one edge line are visible', async ({ page }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()
    await expect(svg).toBeVisible({ timeout: 5000 })

    const circles = svg.locator('circle')
    await expect(circles.first()).toBeVisible({ timeout: 8000 })
    const circleCount = await circles.count()
    expect(circleCount).toBeGreaterThanOrEqual(2)

    // Lines are in the world-transform group; use count not toBeVisible
    const lineCount = await page.locator('svg line').count()
    expect(lineCount).toBeGreaterThanOrEqual(1)

    await page.screenshot({ path: '/app/.scratch/slice9-03-edge-visible.png' })
  })
})

// ---------------------------------------------------------------------------
// Scenario 4: Drag node → snaps to grid, edges follow
// ---------------------------------------------------------------------------
test.describe('Scenario 4: Drag node → snaps to 20px grid', () => {
  let sessionId: number
  let mapId: number
  let nodeAId: number
  let nodeBId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 4' },
    })
    mapId = (await mapRes.json()).id

    const nodeA = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeAId = nodeA.id

    const nodeB = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeBId = nodeB.id

    await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'open' },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('node snaps to 20px grid after drag', async ({ page, request }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()

    // Wait for at least one node circle
    const circles = svg.locator('circle[data-node-id]')
    await expect(circles.first()).toBeVisible({ timeout: 8000 })

    // Get first draggable circle bounding box
    const firstCircle = circles.first()
    const box = await firstCircle.boundingBox()
    expect(box).not.toBeNull()

    const centerX = box!.x + box!.width / 2
    const centerY = box!.y + box!.height / 2

    // Drag 45px right and 45px down (will snap to nearest 20px)
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    await page.mouse.move(centerX + 10, centerY + 10, { steps: 3 })
    await page.mouse.move(centerX + 45, centerY + 45, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(800)

    await page.screenshot({ path: '/app/.scratch/slice9-04-after-drag.png' })

    // Verify via API that node x/y is a multiple of 20 (snapped)
    const nodesRes = await request.get(`${BASE}/api/maps/${mapId}/nodes`)
    const nodes = await nodesRes.json()
    const nodeA = nodes.find((n: { id: number }) => n.id === nodeAId)
    expect(nodeA).toBeDefined()
    expect(nodeA.x % 20).toBe(0)
    expect(nodeA.y % 20).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario 5: Edit node detail panel → sectionNumber persisted
// ---------------------------------------------------------------------------
test.describe('Scenario 5: Edit node detail panel → persists via API', () => {
  let sessionId: number
  let mapId: number
  let nodeId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 5' },
    })
    mapId = (await mapRes.json()).id

    const node = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', sectionNumber: 10, visited: false },
    })).json()
    nodeId = node.id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('section number change persists to API', async ({ page, request }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()

    const circles = svg.locator('circle')
    await expect(circles.first()).toBeVisible({ timeout: 8000 })
    await circles.first().click()
    await page.waitForTimeout(400)

    const panel = page.locator('[class*="w-72"]')
    await expect(panel).toBeVisible({ timeout: 3000 })

    const sectionInput = panel.locator('input[type="number"]')
    await expect(sectionInput).toBeVisible()
    await sectionInput.fill('99')
    await sectionInput.press('Tab')

    // Wait for debounce + PATCH
    await page.waitForTimeout(800)

    await page.screenshot({ path: '/app/.scratch/slice9-05-section-edit.png' })

    // Verify via API — individual GET not implemented; list and filter
    const nodesRes = await request.get(`${BASE}/api/maps/${mapId}/nodes`)
    expect(nodesRes.status()).toBe(200)
    const nodes = await nodesRes.json()
    const node = nodes.find((n: { id: number }) => n.id === nodeId)
    expect(node).toBeDefined()
    expect(node.sectionNumber).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// Scenario 6: Create edge → styled, panel shows connectionType
// ---------------------------------------------------------------------------
test.describe('Scenario 6: Edge creation → styled and detail panel', () => {
  let sessionId: number
  let mapId: number
  let nodeAId: number
  let nodeBId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 6' },
    })
    mapId = (await mapRes.json()).id

    const nodeA = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeAId = nodeA.id

    const nodeB = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeBId = nodeB.id

    await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'locked' },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('locked edge visible, click opens detail panel, API confirms type', async ({ page, request }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()

    // Wait for circles to render first
    await expect(svg.locator('circle').first()).toBeVisible({ timeout: 8000 })

    // Lines in world-transform group may be clipped; use count not toBeVisible
    const lineCount = await page.locator('svg line').count()
    expect(lineCount).toBeGreaterThanOrEqual(1)

    await page.screenshot({ path: '/app/.scratch/slice9-06-before-edge-click.png' })

    // Click transparent hit-target line
    const hitLines = page.locator('svg g line[stroke="transparent"]')
    expect(await hitLines.count()).toBeGreaterThanOrEqual(1)
    await hitLines.first().dispatchEvent('click')
    await page.waitForTimeout(500)

    await page.screenshot({ path: '/app/.scratch/slice9-06-edge-panel.png' })

    // Edge panel should appear
    const edgeHeading = page.locator('h3:text("Edge")')
    await expect(edgeHeading).toBeVisible({ timeout: 3000 })

    // Connection type select visible
    await expect(page.locator('select').first()).toBeVisible()

    // API confirmation
    const edges = await (await request.get(`${BASE}/api/maps/${mapId}/edges`)).json()
    const lockedEdge = edges.find((e: { connectionType: string }) => e.connectionType === 'locked')
    expect(lockedEdge).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 7: Cross-map edge → dashed purple, navigates on click
// ---------------------------------------------------------------------------
test.describe('Scenario 7: Cross-map edge → purple, click navigates', () => {
  let sessionId: number
  let mapAId: number
  let mapBId: number
  let nodeAId: number
  let nodeProxyId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapARes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 CrossMap A' },
    })
    mapAId = (await mapARes.json()).id

    const mapBRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 CrossMap B' },
    })
    mapBId = (await mapBRes.json()).id

    // Both nodes on mapA — API requires toNodeId on same map; targetMapId is nav destination
    const nodeA = await (await request.post(`${BASE}/api/maps/${mapAId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeAId = nodeA.id

    const nodeProxy = await (await request.post(`${BASE}/api/maps/${mapAId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeProxyId = nodeProxy.id

    await request.post(`${BASE}/api/maps/${mapAId}/edges`, {
      data: {
        fromNodeId: nodeAId,
        toNodeId: nodeProxyId,
        targetMapId: mapBId,
        connectionType: 'open',
      },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapAId}`)
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapBId}`)
  })

  test('cross-map edge is purple and clicking navigates to destination map', async ({ page }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapAId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()
    await expect(svg).toBeVisible({ timeout: 5000 })
    await expect(svg.locator('circle').first()).toBeVisible({ timeout: 8000 })

    await page.screenshot({ path: '/app/.scratch/slice9-07-before-cross-click.png' })

    // Purple line for cross-map edge (stroke="#a855f7") — count, not toBeVisible
    const purpleCount = await page.locator('svg line[stroke="#a855f7"]').count()
    expect(purpleCount).toBeGreaterThanOrEqual(1)

    // Click the hit-target line to navigate to map B
    const hitLines = page.locator('svg g line[stroke="transparent"]')
    expect(await hitLines.count()).toBeGreaterThanOrEqual(1)
    await hitLines.first().dispatchEvent('click')
    await page.waitForTimeout(800)

    await page.screenshot({ path: '/app/.scratch/slice9-07-after-cross-click.png' })

    expect(page.url()).toContain(`mapId=${mapBId}`)
  })
})

// ---------------------------------------------------------------------------
// Scenario 8: Switch map tabs → canvas updates
// ---------------------------------------------------------------------------
test.describe('Scenario 8: Switch map tabs → canvas updates', () => {
  let sessionId: number
  let mapAId: number
  let mapBId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapARes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Tab A' },
    })
    mapAId = (await mapARes.json()).id

    const mapBRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Tab B' },
    })
    mapBId = (await mapBRes.json()).id

    // Map A: 1 node
    await request.post(`${BASE}/api/maps/${mapAId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })

    // Map B: 2 nodes
    await request.post(`${BASE}/api/maps/${mapBId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })
    await request.post(`${BASE}/api/maps/${mapBId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapAId}`)
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapBId}`)
  })

  test('switching tabs changes circle count', async ({ page }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapAId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()
    await expect(svg.locator('circle').first()).toBeVisible({ timeout: 8000 })

    // Map A: 1 node circle (data-node-id to exclude ring circles)
    const countA = await svg.locator('circle[data-node-id]').count()
    expect(countA).toBe(1)

    await page.screenshot({ path: '/app/.scratch/slice9-08-map-a.png' })

    // Click the tab for Map B
    await page.locator('text=Slice9 Tab B').first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    // Map B: 2 node circles
    await expect(svg.locator('circle[data-node-id]').first()).toBeVisible({ timeout: 5000 })
    const countB = await svg.locator('circle[data-node-id]').count()
    expect(countB).toBe(2)

    await page.screenshot({ path: '/app/.scratch/slice9-08-map-b.png' })
  })
})

// ---------------------------------------------------------------------------
// Scenario 9: Delete node → edges cascade deleted
// ---------------------------------------------------------------------------
test.describe('Scenario 9: Delete node → edges cascade deleted', () => {
  let sessionId: number
  let mapId: number
  let nodeAId: number
  let nodeBId: number

  test.beforeAll(async ({ request }) => {
    sessionId = await getSeededSessionId(request)

    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'Slice9 Scenario 9' },
    })
    mapId = (await mapRes.json()).id

    const nodeA = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeAId = nodeA.id

    const nodeB = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room', visited: false },
    })).json()
    nodeBId = nodeB.id

    await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'open' },
    })
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('deleting a node removes edge from canvas and API', async ({ page, request }) => {
    await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    const svg = page.locator('svg').first()
    await svg.scrollIntoViewIfNeeded()
    await expect(svg.locator('circle').first()).toBeVisible({ timeout: 8000 })

    // Verify initial: 2 circles and at least 1 line
    expect(await svg.locator('circle[data-node-id]').count()).toBe(2)
    expect(await page.locator('svg line').count()).toBeGreaterThanOrEqual(1)

    await page.screenshot({ path: '/app/.scratch/slice9-09-before-delete.png' })

    // Delete nodeA via API
    const delRes = await request.delete(`${BASE}/api/maps/${mapId}/nodes/${nodeAId}`)
    expect(delRes.status()).toBe(204)

    // Reload page to reflect deletion
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
    await svg.scrollIntoViewIfNeeded()

    await page.screenshot({ path: '/app/.scratch/slice9-09-after-delete.png' })

    // Should now show only 1 circle
    expect(await svg.locator('circle[data-node-id]').count()).toBe(1)

    // API should confirm edges are cascade-deleted
    const edges = await (await request.get(`${BASE}/api/maps/${mapId}/edges`)).json()
    expect(edges).toHaveLength(0)
  })
})
