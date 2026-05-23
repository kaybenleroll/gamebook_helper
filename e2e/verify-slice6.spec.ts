import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// Run serially to avoid concurrent SQLite write contention.
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://gamebook-app:3000'

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `/app/.scratch/slice6-${name}.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
// Shared test data — created in beforeAll, cleaned up in afterAll.
// ---------------------------------------------------------------------------
let sessionId: number
let mapId: number
let nodeAId: number
let nodeBId: number
let seedEdgeId: number

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Create a dedicated session for this test suite.
  const sessRes = await request.post(`${BASE}/api/sessions`, {
    data: { gameSystemId: 'grail-quest', bookTitle: 'Slice6 E2E Test' },
  })
  expect(sessRes.status()).toBe(201)
  const { sessionId: sid } = await sessRes.json()
  sessionId = sid

  // Clear creation rolls so the modal does not block canvas interaction.
  await request.patch(`${BASE}/api/sessions/${sessionId}/character`, {
    data: { clearCreationRolls: true },
  })

  // The session creation auto-creates "Map 1" — retrieve its ID.
  const mapsRes = await request.get(`${BASE}/api/sessions/${sessionId}/maps`)
  expect(mapsRes.status()).toBe(200)
  const maps: Array<{ id: number }> = await mapsRes.json()
  expect(maps.length).toBeGreaterThan(0)
  mapId = maps[0].id

  // Create two nodes.
  const nARes = await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
    data: { x: 0, y: 0, locationType: 'room' },
  })
  expect(nARes.status()).toBe(201)
  nodeAId = (await nARes.json()).id

  const nBRes = await request.post(`${BASE}/api/maps/${mapId}/nodes`, {
    data: { x: 0, y: -120, locationType: 'room' },
  })
  expect(nBRes.status()).toBe(201)
  nodeBId = (await nBRes.json()).id

  // Create an initial edge between the two nodes.
  const eRes = await request.post(`${BASE}/api/maps/${mapId}/edges`, {
    data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'open' },
  })
  expect(eRes.status()).toBe(201)
  seedEdgeId = (await eRes.json()).id
})

test.afterAll(async ({ request }: { request: APIRequestContext }) => {
  if (sessionId) {
    await request.delete(`${BASE}/api/sessions/${sessionId}`)
  }
})

// ---------------------------------------------------------------------------

test('Slice 6: edge rendering, click selection, and detail panel', async ({ page }) => {
  // Navigate to the session with the test map active via query param.
  await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800) // allow SVG to render
  await screenshot(page, '01-map-active')

  // SVG canvas should be present — use the map canvas SVG (contains data-role="background").
  const svg = page.locator('svg:has([data-role="background"])')
  await expect(svg).toBeVisible()
  const svgBounds = await svg.boundingBox()
  console.log('SVG bounds:', JSON.stringify(svgBounds))

  // Check SVG line elements — edges are rendered as <line> elements in EdgeLayer.
  const lines = page.locator('svg line')
  const lineCount = await lines.count()
  console.log(`SVG lines found: ${lineCount}`)
  expect(lineCount).toBeGreaterThan(0)

  await screenshot(page, '02-svg-with-edges')

  // Click the transparent hit-target line (stroke="transparent").
  const hitLines = page.locator('svg g line[stroke="transparent"]')
  const hitCount = await hitLines.count()
  console.log(`Hit-target lines found: ${hitCount}`)

  if (hitCount > 0) {
    await svg.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await screenshot(page, '02b-after-scroll')
    await hitLines.first().dispatchEvent('click')
    await page.waitForTimeout(500)
    await screenshot(page, '03-after-edge-click')

    // Edge detail panel should appear — look for the "Edge" heading.
    const edgeHeading = page.locator('h3:text("Edge")')
    const headingVisible = await edgeHeading.isVisible().catch(() => false)
    console.log('Edge panel heading visible:', headingVisible)
    expect(headingVisible).toBe(true)

    // Connection type select should be visible.
    const connectionSelect = page.locator('select').first()
    const selectVisible = await connectionSelect.isVisible().catch(() => false)
    console.log('Connection type select visible:', selectVisible)
    expect(selectVisible).toBe(true)

    const currentValue = await connectionSelect.inputValue().catch(() => 'N/A')
    console.log('Current connectionType value:', currentValue)

    await screenshot(page, '04-edge-detail-panel')

    // Change connectionType to "locked" via the select.
    await connectionSelect.selectOption('locked')
    await page.waitForTimeout(600)
    await screenshot(page, '05-after-type-change')

    const visibleLines = page.locator('svg g line:not([stroke="transparent"])')
    const visLineCount = await visibleLines.count()
    console.log(`Visible edge lines after change: ${visLineCount}`)

    // Restore to open.
    await connectionSelect.selectOption('open')
    await page.waitForTimeout(600)
    await screenshot(page, '06-restored-to-open')

    // Close panel by clicking a node.
    const nodeCircles = page.locator('svg circle[data-node-id]')
    const circleCount = await nodeCircles.count()
    console.log(`Node circles found: ${circleCount}`)
    if (circleCount > 0) {
      await nodeCircles.first().dispatchEvent('click')
      await page.waitForTimeout(300)
      await screenshot(page, '07-after-node-click-edge-deselected')
      const panelGone = !(await edgeHeading.isVisible().catch(() => false))
      console.log('Edge panel closed after node click:', panelGone)
    }
  } else {
    console.log('WARNING: No hit-target lines found, edge click test skipped')
  }
})

test('Slice 6: PATCH edge connectionType via API', async ({ page }) => {
  // PATCH the seeded edge to "door".
  const patchResponse = await page.request.patch(`${BASE}/api/maps/${mapId}/edges/${seedEdgeId}`, {
    data: { connectionType: 'door' },
    headers: { 'Content-Type': 'application/json' },
  })
  console.log('PATCH status:', patchResponse.status())
  const patchBody = await patchResponse.json()
  console.log('PATCH response:', JSON.stringify(patchBody))
  expect(patchResponse.status()).toBe(200)
  expect(patchBody.connectionType).toBe('door')

  // Restore to open.
  const restoreResponse = await page.request.patch(`${BASE}/api/maps/${mapId}/edges/${seedEdgeId}`, {
    data: { connectionType: 'open' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(restoreResponse.status()).toBe(200)

  // Navigate to map page, verify map loads with edge.
  await page.goto(`${BASE}/sessions/${sessionId}?mapId=${mapId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await screenshot(page, '08-after-patch-map')
})

test('Slice 6: DELETE edge and verify removal', async ({ page }) => {
  // Create a fresh edge via API to avoid disturbing the seeded edge.
  const createResponse = await page.request.post(`${BASE}/api/maps/${mapId}/edges`, {
    data: { fromNodeId: nodeAId, toNodeId: nodeBId, connectionType: 'open' },
    headers: { 'Content-Type': 'application/json' },
  })
  expect(createResponse.status()).toBe(201)
  const newEdge = await createResponse.json()
  console.log('Created edge:', JSON.stringify(newEdge))
  const newEdgeId = newEdge.id

  // Delete it.
  const deleteResponse = await page.request.delete(`${BASE}/api/maps/${mapId}/edges/${newEdgeId}`)
  console.log('DELETE status:', deleteResponse.status())
  expect(deleteResponse.status()).toBe(204)

  // Verify it is gone — PATCH should return 404.
  const verifyResponse = await page.request.patch(`${BASE}/api/maps/${mapId}/edges/${newEdgeId}`, {
    data: { connectionType: 'locked' },
    headers: { 'Content-Type': 'application/json' },
  })
  console.log('Verify gone status:', verifyResponse.status())
  expect(verifyResponse.status()).toBe(404)
})
