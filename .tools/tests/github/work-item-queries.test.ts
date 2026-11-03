import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { afterEach, expect, test, vi } from 'vitest'

import { DB } from '../../../src/services/db'
import { createGithubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { queryGithubAuthors, queryGithubWorkItems } from '../../../src/services/github/work-item-queries'

const db = new DB(`query-test-${crypto.randomUUID()}`)
const cache = createGithubWorkItemCache(db)
const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
function issue(
  id: string,
  overrides: Partial<Extract<SyncedGithubWorkItem, { type: 'issue' }>> = {},
): SyncedGithubWorkItem {
  return {
    id,
    title: id,
    author: null,
    authorAvatarUrl: null,
    item: { labels: [] },
    number: 1,
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://example.test',
    state: 'open',
    syncedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    type: 'issue',
    url: 'https://example.test',
    ...overrides,
  }
}
afterEach(async () => {
  await cache.clear()
  db.close()
})

test('indexed filters implement additive matches, scope and stable keyset page boundaries', async () => {
  const rows = Array.from({ length: 130 }, (_, index) =>
    issue(`owner/repo:${String(index).padStart(3, '0')}`, {
      author: index % 2 ? ' Alice ' : null,
      item: { labels: index % 3 ? [] : [' URGENT '] },
      involvementReasons: index % 5 ? [] : ['mentioned'],
      state: index % 7 ? 'open' : 'closed',
    }),
  )
  await cache.replace(rows, cache.beginSync(), scope)
  const opts = { scope, authors: ['alice'], labels: ['urgent'], showMentioned: true, showClosed: false, limit: 20 }
  const found: string[] = []
  let cursor: { updatedAt: string; id: string } | undefined
  do {
    const page = await queryGithubWorkItems(db, { ...opts, cursor })
    found.push(...page.rows.map(row => row.id))
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  const expected = rows
    .filter((_, index) => index % 7 !== 0 && (index % 2 || !(index % 3) || !(index % 5)))
    .map(row => row.id)
    .sort()
    .reverse()
  expect(found).toEqual(expected)
  expect(new Set(found).size).toBe(found.length)
  const none = await queryGithubWorkItems(db, { ...opts, scope: { ...scope, repositories: [] } })
  expect(none.rows).toEqual([])
  expect(await queryGithubAuthors(db, scope)).toEqual([{ username: ' Alice ', avatarUrl: null }])
})

test('an updated row replaces old filter projections without deleting retained rows', async () => {
  const previous = issue('owner/repo:1', {
    author: 'alice',
    item: { labels: ['urgent'] },
    involvementReasons: ['mentioned'],
  })
  const retained = issue('owner/repo:2', { author: 'alice' })
  await cache.replace([previous, retained], cache.beginSync(), scope)
  await cache.replace(
    [{ ...previous, author: null, item: { labels: [] }, involvementReasons: [] }],
    cache.beginSync(),
    scope,
  )
  const page = await queryGithubWorkItems(db, {
    scope,
    authors: ['alice'],
    labels: ['urgent'],
    showMentioned: true,
    showClosed: true,
    limit: 10,
  })
  expect(page.rows.map(row => row.id)).toEqual(['owner/repo:2'])
  expect(await db.githubWorkItems.count()).toBe(2)
})

test('an archive scan stops when its deadline expires', async () => {
  await cache.replace(
    Array.from({ length: 200 }, (_, index) => issue(`owner/repo:${index}`)),
    cache.beginSync(),
    scope,
  )
  const now = Date.now()
  let checks = 0
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => (checks++ < 10 ? now : now + 1000))
  try {
    await expect(
      queryGithubWorkItems(db, {
        scope,
        showAll: true,
        showClosed: true,
        search: 'no match',
        limit: 10,
        deadlineAt: now + 100,
      }),
    ).rejects.toThrow('timed out')
  } finally {
    clock.mockRestore()
  }
})
