// Deletes all sessions whose bookTitle starts with "[test]" — cleans up after crashed/interrupted runs.
import { request } from '@playwright/test'

export default async function globalTeardown() {
  const context = await request.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  })

  const res = await context.get('/api/sessions')
  if (!res.ok()) {
    await context.dispose()
    return
  }

  const sessions: Array<{ id: number; bookTitle: string }> = await res.json()

  await Promise.all(
    sessions
      .filter((s) => s.bookTitle?.startsWith('[test]'))
      .map((s) => context.delete(`/api/sessions/${s.id}`)),
  )

  await context.dispose()
}
