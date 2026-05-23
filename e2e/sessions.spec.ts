import { test, expect, request } from '@playwright/test'

test('sessions list page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/gamebook/i)
})

test.describe('sessions list with data', () => {
  let sessionId: number

  test.beforeAll(async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    const res = await ctx.post('/api/sessions', {
      data: { bookTitle: '[test] E2E Fixture Session', gameSystemId: 'grail-quest' },
    })
    sessionId = (await res.json()).sessionId
    await ctx.dispose()
  })

  test.afterAll(async ({ baseURL }) => {
    const ctx = await request.newContext({ baseURL })
    await ctx.delete(`/api/sessions/${sessionId}`)
    await ctx.dispose()
  })

  test('sessions list shows adventure entries with delete buttons', async ({ page }) => {
    await page.goto('/')
    const deleteButtons = page.getByRole('button', { name: /delete/i })
    await expect(deleteButtons.first()).toBeVisible()
  })

  test('delete modal opens and requires exact title match', async ({ page }) => {
    await page.goto('/')

    const sessionLink = page.locator(`a[href="/sessions/${sessionId}"]`)
    const listItem = sessionLink.locator('..')
    await listItem.getByRole('button', { name: /^Delete /i }).click()

    await expect(page.getByText('Delete Adventure')).toBeVisible()

    const confirmDeleteButton = page.getByRole('button', { name: /^Delete$/ })
    await expect(confirmDeleteButton).toBeDisabled()

    const input = page.getByPlaceholder('Type book title here')
    await input.fill('wrong title')
    await expect(confirmDeleteButton).toBeDisabled()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Delete Adventure')).not.toBeVisible()
  })
})

test('delete removes session from list immediately', async ({ page }) => {
  // Create a fresh session to safely delete
  const createRes = await page.request.post('/api/sessions', {
    data: { bookTitle: '[test] Playwright Test Delete', gameSystemId: 'grail-quest' },
  })
  expect(createRes.status()).toBe(201)
  const { sessionId } = await createRes.json() as { sessionId: number }

  await page.goto('/')

  // Find by href so we target this specific session even if duplicates exist
  const sessionLink = page.locator(`a[href="/sessions/${sessionId}"]`)
  await expect(sessionLink).toBeVisible()

  // The delete button is the sibling button in the same list item
  const listItem = sessionLink.locator('..')
  const deleteButton = listItem.getByRole('button', { name: /^Delete /i })
  await deleteButton.click()

  // Type exact title to enable delete
  const input = page.getByPlaceholder('Type book title here')
  await input.fill('[test] Playwright Test Delete')

  const confirmDeleteButton = page.getByRole('button', { name: /^Delete$/ })
  await expect(confirmDeleteButton).toBeEnabled()
  await confirmDeleteButton.click()

  // Session disappears from list without page reload
  await expect(sessionLink).not.toBeVisible({ timeout: 5000 })

  // Verify via API — should 404
  const getRes = await page.request.get(`/api/sessions/${sessionId}`)
  expect(getRes.status()).toBe(404)
})
