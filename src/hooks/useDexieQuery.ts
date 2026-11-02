import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'

export function useDexieQuery<T>(query: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ query: () => Promise<T>; attempt: number; data?: T; error?: unknown }>({
    query,
    attempt,
  })
  const retry = useCallback(() => setAttempt(current => current + 1), [])
  useEffect(() => {
    const subscription = liveQuery(async () => query()).subscribe({
      next: data => setState({ query, attempt, data }),
      error: error => setState({ query, attempt, error }),
    })
    return () => subscription.unsubscribe()
  }, [query, attempt])
  const current = state.query === query && state.attempt === attempt
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, retry }
}
