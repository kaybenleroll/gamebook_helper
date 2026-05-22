import { test, expect } from '@playwright/test'

const BASE = 'http://10.89.2.37:3000'

test.describe('Slice 5 — direction-driven node placement', () => {
  let sessionId: number

  test.beforeAll(async ({ request }) => {
    const sessRes = await request.get(`${BASE}/api/sessions`)
    const sessions = await sessRes.json()
    sessionId = sessions[0].id
  })

  // ── API level ────────────────────────────────────────────────────────────

  test('GET /edges returns 200 empty array for new map', async ({ request }) => {
    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'EdgeAPI Test 1' },
    })
    const { id: mapId } = await mapRes.json()

    const res = await request.get(`${BASE}/api/maps/${mapId}/edges`)
    expect(res.status()).toBe(200)
    const edges = await res.json()
    expect(Array.isArray(edges)).toBe(true)
    expect(edges).toHaveLength(0)

    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('POST /edges creates edge between two nodes', async ({ request }) => {
    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'EdgeAPI Test 2' },
    })
    const { id: mapId } = await mapRes.json()

    const n1 = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room' },
    })).json()
    const n2 = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room' },
    })).json()

    const edgeRes = await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: n1.id, toNodeId: n2.id, direction: 'E', connectionType: 'open' },
    })
    expect(edgeRes.status()).toBe(201)
    const edge = await edgeRes.json()
    expect(edge.fromNodeId).toBe(n1.id)
    expect(edge.toNodeId).toBe(n2.id)
    expect(edge.direction).toBe('E')
    expect(edge.connectionType).toBe('open')

    // GET now returns the edge
    const listRes = await request.get(`${BASE}/api/maps/${mapId}/edges`)
    const list = await listRes.json()
    expect(list.some((e: { id: number }) => e.id === edge.id)).toBe(true)

    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('POST /edges rejects unknown fromNodeId (404)', async ({ request }) => {
    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'EdgeAPI Test 3' },
    })
    const { id: mapId } = await mapRes.json()

    const res = await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: 999999, toNodeId: 999999, direction: 'N', connectionType: 'open' },
    })
    expect(res.status()).toBe(404)

    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  test('POST /edges rejects invalid direction (400)', async ({ request }) => {
    const mapRes = await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
      data: { name: 'EdgeAPI Test 4' },
    })
    const { id: mapId } = await mapRes.json()

    const n1 = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 0, y: 0, locationType: 'room' },
    })).json()
    const n2 = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 120, y: 0, locationType: 'room' },
    })).json()

    const res = await request.post(`${BASE}/api/maps/${mapId}/edges`, {
      data: { fromNodeId: n1.id, toNodeId: n2.id, direction: 'NORTHWEST', connectionType: 'open' },
    })
    expect(res.status()).toBe(400)

    await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${mapId}`)
  })

  // ── UI level ─────────────────────────────────────────────────────────────

  test.describe('UI — direction picker and node placement', () => {
    let uiMapId: number

    test.beforeAll(async ({ request }) => {
      const m = await (await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
        data: { name: 'Slice5 UI' },
      })).json()
      uiMapId = m.id
    })

    test.afterAll(async ({ request }) => {
      await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${uiMapId}`)
    })

    test('background click on empty map shows direction picker', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()
      await expect(svg).toBeVisible({ timeout: 5000 })

      // Click the SVG background rect directly (it has data-role="background")
      await page.locator('[data-role="background"]').click()
      await page.waitForTimeout(400)

      // Direction picker should appear
      await expect(page.locator('text=Choose direction')).toBeVisible({ timeout: 3000 })
      await page.screenshot({ path: '/home/mcooney/workspace/gamebook_helper/.scratch/slice5-picker-empty.png' })

      // "No connection" should NOT show (no parent selected)
      await expect(page.locator('text=No connection')).not.toBeVisible()

      // Cancel closes picker without creating node
      await page.click('text=Cancel')
      await expect(page.locator('text=Choose direction')).not.toBeVisible()

      // No nodes created
      const nodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      expect(nodes).toHaveLength(0)
    })

    test('background click → N creates a node on the canvas', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()
      await expect(svg).toBeVisible({ timeout: 5000 })

      await page.locator('[data-role="background"]').click()
      await page.waitForTimeout(400)

      await expect(page.locator('text=Choose direction')).toBeVisible({ timeout: 3000 })
      await page.click('[aria-label="North"]')
      await page.waitForTimeout(600)

      // A node circle should now appear on the canvas
      const circle = svg.locator('circle').first()
      await expect(circle).toBeVisible({ timeout: 5000 })
      await page.screenshot({ path: '/home/mcooney/workspace/gamebook_helper/.scratch/slice5-first-node.png' })

      // Verify node exists in DB
      const nodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      expect(nodes.length).toBeGreaterThan(0)
    })

    test('with node selected: picker shows "No connection", direction creates edge + new node', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()
      await expect(svg).toBeVisible({ timeout: 5000 })

      // Click existing node to select it
      const circle = svg.locator('circle').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      const panel = page.locator('[class*="w-72"]')
      await expect(panel).toBeVisible({ timeout: 3000 })

      // Click background with node selected
      await page.locator('[data-role="background"]').click()
      await page.waitForTimeout(400)

      // Picker shows with "No connection" option (hasParent=true)
      await expect(page.locator('text=Choose direction')).toBeVisible({ timeout: 3000 })
      await expect(page.locator('text=No connection')).toBeVisible()
      await page.screenshot({ path: '/home/mcooney/workspace/gamebook_helper/.scratch/slice5-picker-with-parent.png' })

      const beforeNodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      const prevCount = beforeNodes.length

      // Click S to add connected node to the south
      await page.click('[aria-label="South"]')
      await page.waitForTimeout(800)

      const afterNodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      expect(afterNodes.length).toBe(prevCount + 1)

      const edges = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/edges`)).json()
      expect(edges.length).toBeGreaterThan(0)
      const edge = edges[edges.length - 1]
      expect(edge.direction).toBe('S')

      await page.screenshot({ path: '/home/mcooney/workspace/gamebook_helper/.scratch/slice5-edge-rendered.png' })
    })

    test('"Add connected node" button in detail panel opens picker', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()

      const circle = svg.locator('circle').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      const panel = page.locator('[class*="w-72"]')
      await expect(panel).toBeVisible({ timeout: 3000 })

      await panel.locator('text=Add connected node').click()
      await page.waitForTimeout(400)

      await expect(page.locator('text=Choose direction')).toBeVisible({ timeout: 3000 })
      await expect(page.locator('text=No connection')).toBeVisible()
      await page.screenshot({ path: '/home/mcooney/workspace/gamebook_helper/.scratch/slice5-panel-button.png' })

      await page.click('text=Cancel')
    })

    test('"No connection" creates free node without edge', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      const svg = page.locator('svg').first()
      await svg.scrollIntoViewIfNeeded()

      const circle = svg.locator('circle').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      const beforeNodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      const beforeEdges = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/edges`)).json()

      await page.locator('[data-role="background"]').click()
      await page.waitForTimeout(400)
      await expect(page.locator('text=Choose direction')).toBeVisible({ timeout: 3000 })

      await page.click('text=No connection')
      await page.waitForTimeout(800)

      const afterNodes = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/nodes`)).json()
      const afterEdges = await (await page.request.get(`${BASE}/api/maps/${uiMapId}/edges`)).json()

      expect(afterNodes.length).toBe(beforeNodes.length + 1)
      expect(afterEdges.length).toBe(beforeEdges.length)
    })
  })
})
