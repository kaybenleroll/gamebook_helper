import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://gamebook-app:3000'

test.describe('Map slices 4a/4b/4c', () => {
  let sessionId: number
  let mapId: number
  let nodeId: number

  test.beforeAll(async ({ request }) => {
    // Create a dedicated session for this test suite.
    const sessRes = await request.post(`${BASE}/api/sessions`, {
      data: { gameSystemId: 'grail-quest', bookTitle: '[test] Verify Map Slices 4' },
    })
    expect(sessRes.status()).toBe(201)
    const { sessionId: sid } = await sessRes.json()
    sessionId = sid

    // Clear creation rolls so modal does not block canvas interaction.
    await request.patch(`${BASE}/api/sessions/${sessionId}/character`, {
      data: { clearCreationRolls: true },
    })

    // Session creation auto-creates "Map 1" — retrieve its ID.
    const mapsRes = await request.get(`${BASE}/api/sessions/${sessionId}/maps`)
    expect(mapsRes.status()).toBe(200)
    const maps: Array<{ id: number }> = await mapsRes.json()
    expect(maps.length).toBeGreaterThan(0)
    mapId = maps[0].id
  })

  test.afterAll(async ({ request }) => {
    if (sessionId) {
      await request.delete(`${BASE}/api/sessions/${sessionId}`)
    }
  })

  // --- 4a: CRUD API ---

  test('POST creates a node (201)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 100, y: 200, locationType: 'room', visited: false },
    })
    expect(res.status()).toBe(201)
    const node = await res.json()
    expect(node.id).toBeDefined()
    expect(node.locationType).toBe('room')
    expect(node.x).toBe(100)
    expect(node.isCurrent).toBe(false)
    nodeId = node.id
  })

  test('GET lists nodes', async ({ request }) => {
    const res = await request.get(`${BASE}/api/maps/${mapId}/nodes`)
    expect(res.status()).toBe(200)
    const nodes = await res.json()
    expect(nodes.some((n: { id: number }) => n.id === nodeId)).toBe(true)
  })

  test('PATCH updates fields', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/maps/${mapId}/nodes/${nodeId}`, {
      data: { notes: 'test note', visited: true },
    })
    expect(res.status()).toBe(200)
    const node = await res.json()
    expect(node.notes).toBe('test note')
    expect(node.visited).toBe(true)
  })

  test('set-current clears all and sets target', async ({ request }) => {
    const n2 = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 300, y: 400, locationType: 'corridor', visited: false },
    })).json()

    const r1 = await request.post(`${BASE}/api/maps/${mapId}/nodes/${nodeId}/set-current`)
    expect(r1.status()).toBe(200)
    const list1: { id: number; isCurrent: boolean }[] = await r1.json()
    const currents1 = list1.filter((n) => n.isCurrent)
    expect(currents1).toHaveLength(1)
    expect(currents1[0].id).toBe(nodeId)

    const r2 = await request.post(`${BASE}/api/maps/${mapId}/nodes/${n2.id}/set-current`)
    expect(r2.status()).toBe(200)
    const list2: { id: number; isCurrent: boolean }[] = await r2.json()
    const currents2 = list2.filter((n) => n.isCurrent)
    expect(currents2).toHaveLength(1)
    expect(currents2[0].id).toBe(n2.id)

    await request.delete(`${BASE}/api/maps/${mapId}/nodes/${n2.id}`)
  })

  test('invalid POST returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { locationType: 'room' }, // missing x, y
    })
    expect(res.status()).toBe(400)
  })

  test('DELETE removes node', async ({ request }) => {
    const throwaway = await (await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
      data: { x: 50, y: 50, locationType: 'junction', visited: false },
    })).json()
    const del = await request.delete(`${BASE}/api/maps/${mapId}/nodes/${throwaway.id}`)
    expect(del.status()).toBe(204)
    const list = await (await request.get(`${BASE}/api/maps/${mapId}/nodes`)).json()
    expect(list.some((n: { id: number }) => n.id === throwaway.id)).toBe(false)
  })

  // --- 4b/4c: UI (fresh map with a single known node) ---

  test.describe('UI: canvas and detail panel', () => {
    let uiMapId: number
    let uiNodeId: number

    test.beforeAll(async ({ request }) => {
      // Isolated map with a single node so selectors are unambiguous.
      const m = await (await request.post(`${BASE}/api/sessions/${sessionId}/maps`, {
        data: { name: 'UI Verify Map' },
      })).json()
      uiMapId = m.id

      const n = await (await request.post(`${BASE}/api/maps/${uiMapId}/nodes`, {
        data: { x: 0, y: 0, locationType: 'room', sectionNumber: 42, visited: true },
      })).json()
      uiNodeId = n.id
    })

    test.afterAll(async ({ request }) => {
      await request.delete(`${BASE}/api/sessions/${sessionId}/maps/${uiMapId}`)
    })

    test('node circle renders on canvas', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      // The map canvas SVG contains a background rect — use it as the anchor
      const svg = page.locator('svg:has([data-role="background"])')
      await svg.scrollIntoViewIfNeeded()
      await expect(svg).toBeVisible({ timeout: 5000 })

      // Wait for the node to render
      const circle = svg.locator('circle[data-node-id]').first()
      await expect(circle).toBeVisible({ timeout: 8000 })

      await page.screenshot({ path: '/app/.scratch/map-node-rendered.png' })
    })

    test('clicking a node opens the detail panel with correct data', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      const svg = page.locator('svg:has([data-role="background"])')
      await svg.scrollIntoViewIfNeeded()

      const circle = svg.locator('circle[data-node-id]').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      await page.screenshot({ path: '/app/.scratch/map-panel-open.png' })

      // Panel should be visible — locate within the panel specifically
      const panel = page.locator('[class*="w-72"]')
      await expect(panel).toBeVisible({ timeout: 3000 })

      // Section number within the panel
      const sectionInput = panel.locator('input[type="number"]')
      await expect(sectionInput).toBeVisible()
      const val = await sectionInput.inputValue()
      expect(val).toBe('42')

      // Location type select shows 'room'
      const select = panel.locator('select')
      await expect(select).toBeVisible()
      expect(await select.inputValue()).toBe('room')

      // Visited checkbox is checked (node was created with visited: true)
      const visited = panel.locator('input[type="checkbox"]')
      await expect(visited).toBeChecked()
    })

    test('Custom… reveals free-text input', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      const svg = page.locator('svg:has([data-role="background"])')
      await svg.scrollIntoViewIfNeeded()

      const circle = svg.locator('circle[data-node-id]').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      const panel = page.locator('[class*="w-72"]')
      const select = panel.locator('select')
      await select.selectOption('__custom__')
      await page.waitForTimeout(200)

      const customInput = panel.locator('input[type="text"]')
      await expect(customInput).toBeVisible({ timeout: 2000 })
      await page.screenshot({ path: '/app/.scratch/map-custom-type.png' })
    })

    test('Escape closes the detail panel', async ({ page }) => {
      await page.goto(`${BASE}/sessions/${sessionId}?mapId=${uiMapId}`)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(800)

      const svg = page.locator('svg:has([data-role="background"])')
      await svg.scrollIntoViewIfNeeded()

      const circle = svg.locator('circle[data-node-id]').first()
      await expect(circle).toBeVisible({ timeout: 8000 })
      await circle.click()
      await page.waitForTimeout(300)

      const panel = page.locator('[class*="w-72"]')
      await expect(panel).toBeVisible({ timeout: 3000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await expect(panel).not.toBeVisible()
      await page.screenshot({ path: '/app/.scratch/map-panel-closed.png' })
    })
  })
})
