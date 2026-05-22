import { test, expect } from '@playwright/test'

test('sessions list page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/gamebook/i)
})

test('sessions list shows adventure entries with delete buttons', async ({ page }) => {
  await page.goto('/')
  const deleteButtons = page.getByRole('button', { name: /delete/i })
  await expect(deleteButtons.first()).toBeVisible()
})

test('delete modal opens and requires exact title match', async ({ page }) => {
  await page.goto('/')

  // Click the first delete button
  const firstDeleteButton = page.getByRole('button', { name: /delete/i }).first()
  await firstDeleteButton.click()

  // Modal should be visible
  await expect(page.getByText('Delete Adventure')).toBeVisible()

  // Delete button in modal should be disabled with no input
  const confirmDeleteButton = page.getByRole('button', { name: /^Delete$/ })
  await expect(confirmDeleteButton).toBeDisabled()

  // Typing a wrong title keeps the button disabled
  const input = page.getByPlaceholder('Type book title here')
  await input.fill('wrong title')
  await expect(confirmDeleteButton).toBeDisabled()

  // Cancel closes the modal
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Delete Adventure')).not.toBeVisible()
})

test('delete removes session from list immediately', async ({ page }) => {
  // Create a fresh session to safely delete
  const createRes = await page.request.post('/api/sessions', {
    data: { bookTitle: 'Playwright Test Delete', gameSystemId: 'grail-quest' },
  })
  expect(createRes.status()).toBe(201)
  const { sessionId } = await createRes.json() as { sessionId: number }

  await page.goto('/')

  // Find by href so we target this specific session even if duplicates exist
  const sessionLink = page.locator(`a[href="/sessions/${sessionId}"]`)
  await expect(sessionLink).toBeVisible()

  // The delete button is the sibling button in the same list item
  const listItem = sessionLink.locator('..')
  const deleteButton = listItem.getByRole('button')
  await deleteButton.click()

  // Type exact title to enable delete
  const input = page.getByPlaceholder('Type book title here')
  await input.fill('Playwright Test Delete')

  const confirmDeleteButton = page.getByRole('button', { name: /^Delete$/ })
  await expect(confirmDeleteButton).toBeEnabled()
  await confirmDeleteButton.click()

  // Session disappears from list without page reload
  await expect(sessionLink).not.toBeVisible({ timeout: 5000 })

  // Verify via API — should 404
  const getRes = await page.request.get(`/api/sessions/${sessionId}`)
  expect(getRes.status()).toBe(404)
})
