import { useCallback, useRef } from 'react'

/**
 * Optimistic mutation wrapper.
 *
 * Usage:
 *   const mutate = useOptimisticMutation(setState)
 *   await mutate(
 *     (prev) => appliedState,           // optimistic apply
 *     () => apiCall(),                  // async API call
 *     (prev) => revertedState,          // optional: revert fn (defaults to original state)
 *   )
 *
 * On success the optimistic state persists.
 * On failure the state is silently reverted to what it was before the call.
 */
export function useOptimisticMutation<S>(
  setState: React.Dispatch<React.SetStateAction<S>>,
) {
  // We keep a ref so the revert always uses the pre-optimistic snapshot even
  // after re-renders.
  const snapshotRef = useRef<S | null>(null)

  const mutate = useCallback(
    async (
      applyFn: (prev: S) => S,
      apiFn: () => Promise<void>,
      revertFn?: (prev: S) => S,
    ): Promise<boolean> => {
      // Capture pre-optimistic state and apply optimistically.
      setState((prev) => {
        snapshotRef.current = prev
        return applyFn(prev)
      })

      try {
        await apiFn()
        return true
      } catch {
        // Revert silently.
        setState((current) => {
          const snapshot = snapshotRef.current
          if (snapshot === null) return current
          return revertFn ? revertFn(snapshot) : snapshot
        })
        return false
      } finally {
        snapshotRef.current = null
      }
    },
    [setState],
  )

  return mutate
}
