import type { QueryKey } from '@tanstack/react-query'
import type { TestContext } from 'node:test'

import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { queryClient, queryKeys } from '../lib/query-client'
import { syncProviders } from './sync'

afterEach(() => {
  queryClient.clear()
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
})

function observe(t: TestContext, queryKey: QueryKey, queryFn: () => Promise<unknown>, enabled = true) {
  const observer = new QueryObserver(queryClient, {
    queryKey,
    queryFn,
    enabled,
    retry: false,
    initialData: {},
    staleTime: Infinity,
  })
  t.after(observer.subscribe(() => {}))
}

test('full sync refreshes every enabled provider and Clockify read, including manual sync queries', async t => {
  const called: string[] = []
  const keys = [
    queryKeys.clockify.entrySync({ params: { userId: 'user', workspaceId: 'workspace' } }),
    queryKeys.clockify.runningEntry(),
    ...['today', 'week', 'month'].map(period => queryKeys.clockify.summaryReport({ params: { period } })),
    queryKeys.linear.ticketSync({ params: { syncLimit: 50 } }),
    queryKeys.github.workItemSync({ params: { repositories: 'owner/repo' } }),
  ]
  keys.forEach(key =>
    observe(t, key, async () => {
      called.push(JSON.stringify(key))
      return {}
    }),
  )
  observe(
    t,
    queryKeys.github.workItemSync({ params: { repositories: 'disabled' } }),
    async () => {
      assert.fail('Disabled query must not sync')
    },
    false,
  )
  queryClient.setQueryData(queryKeys.github.workItemSync({ params: { repositories: 'old' } }), {})

  const result = await syncProviders()

  assert.equal(called.length, keys.length)
  assert.equal(result.synced.length, 5)
})

test('concurrent callers share one full sync and join an already-running provider request', async t => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => {
    finish = resolve
  })
  let calls = 0
  const key = queryKeys.github.workItemSync()
  observe(t, key, async () => {
    calls++
    await gate
    return {}
  })
  const background = queryClient.refetchQueries({ queryKey: key })
  const first = syncProviders()
  const second = syncProviders()

  assert.equal(first, second)
  assert.equal(calls, 1)
  finish()
  await Promise.all([background, first, second])
  await syncProviders()
  assert.equal(calls, 2)
})

test('sync waits for other providers, reports failures, and allows retry', async t => {
  let finish!: () => void
  const gate = new Promise<void>(resolve => {
    finish = resolve
  })
  let fail = true
  observe(t, queryKeys.github.workItemSync(), async () => {
    if (fail) throw new Error('Provider unavailable')
    return {}
  })
  observe(t, queryKeys.linear.ticketSync(), async () => {
    await gate
    return {}
  })
  let completed = false
  const pending = syncProviders().finally(() => {
    completed = true
  })
  const rejected = assert.rejects(pending, /Sync failed: GitHub work items/)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(completed, false)
  finish()
  await rejected

  fail = false
  assert.equal((await syncProviders()).synced.length, 2)
})

test('offline paused queries do not count as a successful refresh', async t => {
  observe(t, queryKeys.github.workItemSync(), async () => ({}))
  onlineManager.setOnline(false)
  await assert.rejects(syncProviders(), /Sync failed: GitHub work items/)
})

test('explicit sync recovers paused requests after reconnect while the app stays hidden', async t => {
  const key = queryKeys.github.workItemSync()
  let fetched = false
  observe(t, key, async () => {
    fetched = true
    return {}
  })
  focusManager.setFocused(false)
  onlineManager.setOnline(false)
  await queryClient.refetchQueries({ queryKey: key })
  assert.equal(queryClient.getQueryState(key)?.fetchStatus, 'paused')
  onlineManager.setOnline(true)

  const result = await syncProviders()

  assert.equal(fetched, true)
  assert.equal(queryClient.getQueryState(key)?.fetchStatus, 'idle')
  assert.deepEqual(result.synced, ['GitHub work items'])
})
