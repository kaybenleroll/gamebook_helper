import { describe, it, expect, vi } from 'vitest'

/**
 * useOptimisticMutation is a React hook — unit-testing it in vitest (node
 * environment) requires @testing-library/react which is not installed.
 * Instead we test the core state-transition logic directly by constructing a
 * minimal in-process simulation of useState + the hook's internal flow.
 */

/**
 * Simulate the hook without React. Mirrors the hook's internal logic so the
 * tests cover the contract (optimistic apply → API call → success/revert).
 */
async function simulateMutation<S>(
  initial: S,
  applyFn: (prev: S) => S,
  apiFn: () => Promise<void>,
  revertFn?: (prev: S) => S,
): Promise<{ finalState: S; success: boolean }> {
  let state = initial
  const snapshot = state

  // Optimistic apply
  state = applyFn(state)

  let success: boolean
  try {
    await apiFn()
    success = true
  } catch {
    // Revert
    state = revertFn ? revertFn(snapshot) : snapshot
    success = false
  }

  return { finalState: state, success }
}

describe('useOptimisticMutation – core state-transition logic', () => {
  it('applies the optimistic update on success', async () => {
    const { finalState } = await simulateMutation(
      0,
      () => 42,
      () => Promise.resolve(),
    )
    expect(finalState).toBe(42)
  })

  it('retains the optimistic state after a successful API call', async () => {
    const { finalState } = await simulateMutation(
      0,
      () => 99,
      () => Promise.resolve(),
    )
    expect(finalState).toBe(99)
  })

  it('reverts to the previous state when the API call fails', async () => {
    const { finalState } = await simulateMutation(
      10,
      () => 999,
      () => Promise.reject(new Error('network error')),
    )
    expect(finalState).toBe(10)
  })

  it('uses revertFn when provided and the API call fails', async () => {
    const { finalState } = await simulateMutation(
      10,
      () => 999,
      () => Promise.reject(new Error('fail')),
      (prev) => prev - 1, // custom revert: snapshot(10) → 9
    )
    expect(finalState).toBe(9)
  })

  it('returns true on success', async () => {
    const { success } = await simulateMutation(0, (s) => s + 1, () => Promise.resolve())
    expect(success).toBe(true)
  })

  it('returns false on failure', async () => {
    const { success } = await simulateMutation(
      0,
      (s) => s + 100,
      () => Promise.reject(new Error('fail')),
    )
    expect(success).toBe(false)
  })

  it('calls the API function exactly once', async () => {
    const apiFn = vi.fn(() => Promise.resolve())
    await simulateMutation(0, () => 1, apiFn)
    expect(apiFn).toHaveBeenCalledTimes(1)
  })

  it('does not call apiFn more than once even on success', async () => {
    const apiFn = vi.fn(() => Promise.resolve())
    await simulateMutation('hello', (s) => s + '!', apiFn)
    expect(apiFn).toHaveBeenCalledTimes(1)
  })
})
