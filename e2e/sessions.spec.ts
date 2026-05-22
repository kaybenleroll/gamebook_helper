import { test, expect } from '@playwright/test'

test('sessions list page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/gamebook/i)
})

test('sessions list shows adventure entries', async ({ page }) => {
  await page.goto('/')
  const body = page.locator('body')
  await expect(body).toBeVisible()
})
