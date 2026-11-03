import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useReducer } from 'react'

import { db } from '../services/db'

export function useDexieQuery<T>(query: (signal: AbortSignal) => Promise<T>, scopeKey?: string) {
  const [attempt, retry] = useReducer(value => value + 1, 0)
  const request = useMemo(
    () => ({ scopeKey, controller: undefined as AbortController | undefined }),
    [query, scopeKey, attempt],
  )
  useEffect(() => () => request.controller?.abort(), [request])
  const result = useLiveQuery(async () => {
    // Our paged scans need a public signal in addition to Dexie's subscription cleanup.
    request.controller?.abort()
    const controller = new AbortController()
    request.controller = controller
    try {
      if (attempt) await db.open()
      controller.signal.throwIfAborted()
      return { request, data: await query(controller.signal), error: undefined }
    } catch (error) {
      return { request, data: undefined, error }
    }
  }, [request])
  const current = result?.request === request
  return {
    data: result?.request.scopeKey === scopeKey ? result?.data : undefined,
    error: current ? result?.error : undefined,
    isPending: !current,
    retry,
  }
}
