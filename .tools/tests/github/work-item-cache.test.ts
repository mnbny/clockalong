import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import Dexie from 'dexie'
import { afterEach, expect, test, vi } from 'vitest'

import { DB } from '../../../src/services/db'
import { createGithubWorkItemCache, type GithubCacheScope } from '../../../src/services/github/work-item-cache'

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
  vi.restoreAllMocks()
  const activeCaches = caches.splice(0)
  for (const cache of activeCaches) cache.database.close()
  for (const cache of activeCaches) await cache.database.delete()
})

test('an older sync cannot overwrite a newer completed sync', async () => {
  const cache = makeCache()
  const older = cache.beginSync()
  const newer = cache.beginSync()
  await cache.replace([item('owner/repo:1', 'newer')], newer, all)
  await expect(cache.replace([item('owner/repo:1', 'older')], older, all)).rejects.toThrow('superseded')
  expect((await cache.database.githubWorkItems.get('owner/repo:1'))?.title).toBe('newer')
})

test('clear during a write rolls back that sync before clearing all GitHub projections', async () => {
  const cache = makeCache()
  await cache.replace([item('owner/repo:saved')], cache.beginSync(), all)
  const original = cache.database.githubWorkItems.bulkPut.bind(cache.database.githubWorkItems)
  let cleared: Promise<number> | undefined
  vi.spyOn(cache.database.githubWorkItems, 'bulkPut').mockImplementationOnce(rows =>
    original(rows).then(key => {
      cleared = Dexie.ignoreTransaction(() => cache.clear())
      return key
    }),
  )
  try {
    await expect(cache.replace([item('owner/repo:late')], cache.beginSync(), all)).rejects.toThrow('superseded')
  } finally {
    await cleared
  }
  expect(await cache.database.githubWorkItems.count()).toBe(0)
  expect(await cache.database.githubWorkItemIndex.count()).toBe(0)
  expect(await cache.database.githubAuthors.count()).toBe(0)
})

test('a failed write preserves saved rows and clear prevents a late sync from restoring them', async () => {
  const cache = makeCache()
  await cache.replace([item('owner/repo:1')], cache.beginSync(), all)
  vi.spyOn(cache.database.githubWorkItemIndex, 'bulkPut').mockRejectedValueOnce(new Error('disk full'))
  await expect(cache.replace([item('owner/repo:2')], cache.beginSync(), all)).rejects.toThrow('disk full')
  expect((await cache.database.githubWorkItems.toArray()).map(row => row.id)).toEqual(['owner/repo:1'])
  vi.restoreAllMocks()
  const oldSync = cache.beginSync()
  expect(await cache.clear()).toBe(1)
  await expect(cache.replace([item('owner/repo:2')], oldSync, all)).rejects.toThrow('superseded')
  expect(await cache.database.githubWorkItems.count()).toBe(0)
  expect(await cache.database.githubWorkItemIndex.count()).toBe(0)
})
