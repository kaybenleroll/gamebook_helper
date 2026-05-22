import { test, expect, request, type Page } from '@playwright/test'

async function dismissModal(page: Page) {
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) {
    await gotIt.click()
    await page.locator('.fixed.inset-0').waitFor({ state: 'hidden' })
  }
}

test.describe('Issue #50 — typed stat editing', () => {
  let sessionId: number

  test.beforeAll(async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.post('/api/sessions', {
      data: { bookTitle: 'Verify #50', gameSystemId: 'grail-quest' },
    })
    sessionId = (await res.json()).sessionId
    await ctx.dispose()
  })

  test.afterAll(async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    await ctx.delete(`/api/sessions/${sessionId}`)
    await ctx.dispose()
  })

  test('Apply and Set buttons appear on character sheet', async ({ page }) => {
    await page.goto(`/sessions/${sessionId}`)
    await expect(page.getByRole('button', { name: /Apply Life Points change/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Apply starting Life Points change/i })).toBeVisible()
  })

  test('typed delta +5 updates current LP', async ({ page, request: req }) => {
    // Seed LP to 10 so +5 stays well below the statDef.max cap of 48
    await req.patch(`/api/sessions/${sessionId}/character`, {
      data: { stat: 'lifePoints', value: 10 },
    })

    await page.goto(`/sessions/${sessionId}`)
    await dismissModal(page)

    await page.getByLabel('Set Life Points').fill('+5')
    await page.getByLabel('Apply Life Points change').click()
    await page.waitForTimeout(400)

    const afterLP = await page.locator('span.font-mono').first().textContent()
    expect(parseInt(afterLP ?? '0')).toBe(15)
  })

  test('typed absolute value sets current LP exactly', async ({ page }) => {
    await page.goto(`/sessions/${sessionId}`)
    await dismissModal(page)
    await page.getByLabel('Set Life Points').fill('15')
    await page.getByLabel('Apply Life Points change').click()
    await page.waitForTimeout(400)

    const afterLP = await page.locator('span.font-mono').first().textContent()
    expect(parseInt(afterLP ?? '0')).toBe(15)
  })

  test('Set button on starting column updates initial LP', async ({ page }) => {
    await page.goto(`/sessions/${sessionId}`)
    await dismissModal(page)
    await page.getByLabel('Set starting Life Points').fill('40')
    await page.getByLabel('Apply starting Life Points change').click()
    await page.waitForTimeout(400)

    const sessionData = await page.request.get(`/api/sessions/${sessionId}`)
    const json = (await sessionData.json()) as { character: { initialStats: { lifePoints: number } } }
    expect(json.character.initialStats.lifePoints).toBe(40)
  })
})
