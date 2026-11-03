import { liveQuery } from 'dexie'
import { useCallback, useEffect, useState } from 'react'

export function useDexieQuery<T>(query: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    query: (signal: AbortSignal) => Promise<T>
    attempt: number
    data?: T
    error?: unknown
  }>({
    query,
    attempt,
  })
  const retry = useCallback(() => setAttempt(current => current + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    const subscription = liveQuery(async () => query(controller.signal)).subscribe({
      next: data => setState({ query, attempt, data }),
      error: error => setState({ query, attempt, error }),
    })
    return () => {
      controller.abort()
      subscription.unsubscribe()
    }
  }, [query, attempt])
  const current = state.query === query && state.attempt === attempt
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, retry }
}
