import type { QueryKey } from '@tanstack/react-query'

import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { syncProviders } from '../../../src/services/sync'

afterEach(() => {
  queryClient.clear()
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
})

function observe(queryKey: QueryKey, queryFn: () => Promise<unknown>, enabled = true) {
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn,
    enabled,
    retry: false,
    initialData: {},
    staleTime: Infinity,
  })
  onTestFinished(observer.subscribe(() => {}))
}

test('full sync refreshes every enabled provider and Clockify read, including manual sync queries', async () => {
  const called: string[] = []
  const keys = [
    queryKeys.clockify.entrySync({ params: { userId: 'user', workspaceId: 'workspace' } }),
    queryKeys.clockify.runningEntry(),
    ...['today', 'week', 'month'].map(period => queryKeys.clockify.summaryReport({ params: { period } })),
    queryKeys.linear.ticketSync({ params: { syncLimit: 50 } }),
    queryKeys.github.workItemSync({ params: { repositories: 'owner/repo' } }),
  ]
  keys.forEach(key =>
    observe(key, async () => {
      called.push(JSON.stringify(key))
      return {}
    }),
  )
  observe(
    queryKeys.github.workItemSync({ params: { repositories: 'disabled' } }),
    async () => {
      expect.fail('Disabled query must not sync')
    },
    false,
  )
  queryClient.setQueryData(queryKeys.github.workItemSync({ params: { repositories: 'old' } }), {})

  const result = await syncProviders()

  expect(called.length).toBe(keys.length)
  expect(result.synced.length).toBe(5)
})

test('concurrent callers share one full sync and join an already-running provider request', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => {
    finish = resolve
  })
  let calls = 0
  const key = queryKeys.github.workItemSync()
  observe(key, async () => {
    calls++
    await gate
    return {}
  })
  const background = queryClient.refetchQueries({ queryKey: key })
  const first = syncProviders()
  const second = syncProviders()

  expect(first).toBe(second)
  expect(calls).toBe(1)
  finish()
  await Promise.all([background, first, second])
  await syncProviders()
  expect(calls).toBe(2)
})

test('sync waits for other providers, reports failures, and allows retry', async () => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => {
    finish = resolve
  })
  let fail = true
  observe(queryKeys.github.workItemSync(), async () => {
    if (fail) throw new Error('Provider unavailable')
    return {}
  })
  observe(queryKeys.linear.ticketSync(), async () => {
    await gate
    return {}
  })
  let completed = false
  const pending = syncProviders().finally(() => {
    completed = true
  })
  const rejected = expect(pending).rejects.toThrow(/Sync failed: GitHub work items/)
  await new Promise(resolve => setImmediate(resolve))
  expect(completed).toBe(false)
  finish()
  await rejected

  fail = false
  expect((await syncProviders()).synced.length).toBe(2)
})

test('offline paused queries do not count as a successful refresh', async () => {
  observe(queryKeys.github.workItemSync(), async () => ({}))
  onlineManager.setOnline(false)
  await expect(syncProviders()).rejects.toThrow(/Sync failed: GitHub work items/)
})

test('explicit sync recovers paused requests after reconnect while the app stays hidden', async () => {
  const key = queryKeys.github.workItemSync()
  let fetched = false
  observe(key, async () => {
    fetched = true
    return {}
  })
  focusManager.setFocused(false)
  onlineManager.setOnline(false)
  await queryClient.refetchQueries({ queryKey: key })
  expect(queryClient.getQueryState(key)?.fetchStatus).toBe('paused')
  onlineManager.setOnline(true)

  const result = await syncProviders()

  expect(fetched).toBe(true)
  expect(queryClient.getQueryState(key)?.fetchStatus).toBe('idle')
  expect(result.synced).toStrictEqual(['GitHub work items'])
})
