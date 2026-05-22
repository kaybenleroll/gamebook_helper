import { test, expect, request } from '@playwright/test'

test('game-over modal appears when LP hits zero', async ({ page }) => {
  const createRes = await page.request.post('/api/sessions', {
    data: { bookTitle: 'GameOver Modal Test', gameSystemId: 'grail-quest' },
  })
  const { sessionId } = await createRes.json() as { sessionId: number }

  // Dismiss creation rolls modal
  await page.goto(`/sessions/${sessionId}`)
  const gotIt = page.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible()) await gotIt.click()

  // Drive LP to 1 via API so one more click triggers game-over
  await page.request.patch(`/api/sessions/${sessionId}/character`, {
    data: { stat: 'lifePoints', value: 1 },
  })
  await page.reload()
  const gotIt2 = page.getByRole('button', { name: 'Got it' })
  if (await gotIt2.isVisible()) await gotIt2.click()

  // Click minus to bring LP to 0
  await page.getByLabel('Decrease Life Points', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Game Over' })).toBeVisible({ timeout: 3000 })
  await expect(page.getByText('Your Life Points have reached zero')).toBeVisible()

  // Dismiss modal
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByRole('heading', { name: 'Game Over' })).not.toBeVisible()

  // Cleanup
  await page.request.delete(`/api/sessions/${sessionId}`)
})
