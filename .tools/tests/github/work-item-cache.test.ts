import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query'
import Dexie, { liveQuery } from 'dexie'
import { afterEach, expect, test, vi } from 'vitest'

import { DB } from '../../../src/services/db'
import { githubWorkItemCacheQueryOptions } from '../../../src/services/github/sync'
import { createGithubWorkItemCache, type GithubCacheScope } from '../../../src/services/github/work-item-cache'
import { queryGithubAuthors, queryGithubWorkItems } from '../../../src/services/github/work-item-queries'

const caches: ReturnType<typeof createGithubWorkItemCache>[] = []
const all: GithubCacheScope = {
  repositories: ['owner/repo', 'owner/kept', 'owner/removed'],
  visibleWorkItemTypes: { issues: true, pullRequests: true },
}

function makeCache(name = crypto.randomUUID()) {
  const cache = createGithubWorkItemCache(new DB(`test-github-${name}`))
  caches.push(cache)
  return cache
}

function item(id: string, title = id): SyncedGithubWorkItem {
  return {
    id,
    title,
    author: null,
    authorAvatarUrl: null,
    item: { labels: [] },
    number: 1,
    repositoryFullName: id.split(':')[0],
    repositoryOwner: 'owner',
    repositoryUrl: 'https://github.com/owner/repo',
    state: 'open',
    syncedAt: '2026-01-01',
    type: 'issue',
    updatedAt: '2026-01-01',
    url: 'https://github.com/owner/repo/issues/1',
  }
}

afterEach(async () => {
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
  const activeCaches = caches.splice(0)
  for (const cache of activeCaches) cache.database.close()
  for (const cache of activeCaches) await cache.database.delete()
})

test('an offline live subscriber reads persisted rows without starting a remote fetch', async () => {
  const name = crypto.randomUUID()
  const first = makeCache(name)
  await first.replace([item('owner/repo:1')], first.beginSync(), all)
  first.database.close()
  const reopened = makeCache(name)
  const received: string[][] = []
  const subscription = liveQuery(() =>
    queryGithubWorkItems(reopened.database, { scope: all, showAll: true, showClosed: true, limit: 50 }),
  ).subscribe(page => received.push(page.rows.map(row => row.id)))
  const client = new QueryClient()
  const remoteFetch = vi.fn(async () => [])
  onlineManager.setOnline(false)
  const remote = new QueryObserver(client, { queryKey: ['remote'], queryFn: remoteFetch })
  const hydration = new QueryObserver(client, githubWorkItemCacheQueryOptions(reopened))
  const stopRemote = remote.subscribe(() => {})
  const stopHydration = hydration.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(received).toContainEqual(['owner/repo:1']))
    await vi.waitFor(() => expect(hydration.getCurrentResult().isSuccess).toBe(true))
    expect(remote.getCurrentResult().fetchStatus).toBe('paused')
    expect(remoteFetch).not.toHaveBeenCalled()
  } finally {
    stopRemote()
    stopHydration()
    subscription.unsubscribe()
    client.clear()
  }
})

test(
  'persists large data, retains older in-scope rows and removes deselected repositories',
  { timeout: 20_000 },
  async () => {
    const name = crypto.randomUUID()
    const first = makeCache(name)
    const rows = Array.from({ length: 6000 }, (_, index) =>
      item(`${index % 2 ? 'owner/removed' : 'owner/kept'}:${index}`, 'x'.repeat(1000)),
    )
    expect(JSON.stringify(rows).length).toBeGreaterThan(5_000_000)
    await first.replace(rows, first.beginSync(), all)
    first.database.close()
    const reopened = makeCache(name)
    await reopened.ready()
    expect(await reopened.database.githubWorkItems.count()).toBe(6000)
    const kept = { ...rows[0], title: 'updated' }
    const scope = { ...all, repositories: ['owner/kept'] }
    expect(await reopened.replace([kept], reopened.beginSync(), scope)).toEqual({ deleted: 3000, stored: 1 })
    reopened.database.close()
    const final = makeCache(name)
    await final.ready()
    expect(await final.database.githubWorkItems.count()).toBe(3000)
    expect((await final.database.githubWorkItems.get(kept.id))?.title).toBe('updated')
    expect(await final.database.githubWorkItems.get(rows[2].id)).toBeDefined()
    expect(await final.database.githubWorkItems.get(rows[1].id)).toBeUndefined()
  },
)

test('offline database readiness reports open failures and can retry', async () => {
  const cache = makeCache()
  const open = vi.spyOn(cache.database, 'open').mockRejectedValueOnce(new Error('read failed'))
  const client = new QueryClient()
  onlineManager.setOnline(false)
  const observer = new QueryObserver(client, githubWorkItemCacheQueryOptions(cache))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().error?.message).toBe('read failed'))
    open.mockRestore()
    expect((await observer.refetch()).isSuccess).toBe(true)
  } finally {
    unsubscribe()
    client.clear()
  }
})

test('an older sync cannot overwrite a newer completed sync', async () => {
  const cache = makeCache()
  const older = cache.beginSync()
  const newer = cache.beginSync()
  await cache.replace([item('owner/repo:1', 'newer')], newer, all)
  await expect(cache.replace([item('owner/repo:1', 'older')], older, all)).rejects.toThrow('superseded')
  expect((await cache.database.githubWorkItems.get('owner/repo:1'))?.title).toBe('newer')
})

test('failed writes roll back all tables and clear invalidates old syncs without deleting the database', async () => {
  const cache = makeCache()
  await cache.replace([item('owner/repo:1')], cache.beginSync(), all)
  vi.spyOn(cache.database.githubWorkItemIndex, 'bulkPut').mockRejectedValueOnce(new Error('disk full'))
  await expect(cache.replace([item('owner/repo:2')], cache.beginSync(), all)).rejects.toThrow('disk full')
  expect((await cache.database.githubWorkItems.toArray()).map(row => row.id)).toEqual(['owner/repo:1'])
  vi.restoreAllMocks()
  const oldSync = cache.beginSync()
  const deleteDatabase = vi.spyOn(cache.database, 'delete')
  expect(await cache.clear()).toBe(1)
  await expect(cache.replace([item('owner/repo:2')], oldSync, all)).rejects.toThrow('superseded')
  expect(await cache.database.githubWorkItems.count()).toBe(0)
  expect(await cache.database.githubWorkItemIndex.count()).toBe(0)
  expect(deleteDatabase).not.toHaveBeenCalled()
})

test('v1 rows receive usable index and author projections on upgrade', async () => {
  const name = `test-github-${crypto.randomUUID()}`
  const v1 = new Dexie(name)
  v1.version(1).stores({ githubWorkItems: 'id' })
  await v1
    .table('githubWorkItems')
    .put({ ...item('owner/repo:1'), author: 'Alice', authorAvatarUrl: 'avatar', item: { labels: [' Urgent '] } })
  await v1
    .table('githubWorkItems')
    .bulkPut(Array.from({ length: 260 }, (_, index) => item(`owner/repo:extra-${index}`)))
  v1.close()
  const cache = createGithubWorkItemCache(new DB(name))
  caches.push(cache)
  const page = await queryGithubWorkItems(cache.database, {
    scope: all,
    authors: ['alice'],
    labels: ['urgent'],
    showClosed: false,
    limit: 10,
  })
  expect(page.rows.map(row => row.id)).toEqual(['owner/repo:1'])
  expect(await cache.database.githubWorkItems.count()).toBe(261)
  expect(await cache.database.githubWorkItemIndex.count()).toBe(263)
  expect(await queryGithubAuthors(cache.database, all)).toEqual([{ username: 'Alice', avatarUrl: 'avatar' }])
})
