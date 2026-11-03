import type { LinearTicketSortOrderOption } from '../../../src/services/linear/ticket-settings'
import type { AssignedIssueNode } from '../../../src/services/linear/tickets'

import Dexie, { liveQuery } from 'dexie'
import { afterEach, expect, test, vi } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { DB } from '../../../src/services/db'
import { createLinearTicketCache } from '../../../src/services/linear/ticket-cache'
import { queryLinearPage } from '../../../src/services/linear/ticket-queries'
import { toLinearTicket } from '../../../src/services/linear/tickets'
import { compareLinearTickets } from '../../../src/services/linear/tickets-sorting'

const caches: ReturnType<typeof createLinearTicketCache>[] = []
function cache(name = crypto.randomUUID()) {
  const result = createLinearTicketCache(new DB(`test-linear-${name}`))
  caches.push(result)
  return result
}
function issue(id: string, time = '2026-01-01T00:00:00Z', status = 'started'): AssignedIssueNode {
  return {
    id,
    identifier: `TASK-${id}`,
    title: `Title ${id}`,
    url: `https://linear.app/acme/issue/TASK-${id}`,
    createdAt: time,
    updatedAt: time,
    state: { id: status, name: status, type: status, color: '#fff', position: 1 },
    assignee: null,
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  const all = caches.splice(0)
  for (const c of all) c.database.close()
  for (const c of all) await c.database.delete()
})

test('v3 upgrade preserves GitHub and Clockify stores', async () => {
  const name = `test-linear-upgrade-${crypto.randomUUID()}`
  const old = new Dexie(name)
  old.version(3).stores({
    githubWorkItems: 'id,[repositoryFullName+type],refKey',
    githubWorkItemIndex: '[token+updatedAt+rowId],rowId',
    githubAuthors: 'id,[usernameKey+id]',
    githubCacheMeta: 'key',
    clockifyEntries: '[userId+workspaceId+id],[userId+workspaceId+startedAt+id]',
    clockifyEntryRefs:
      '[userId+workspaceId+refKey+entryId],[userId+workspaceId+refKey+startedAt+entryId],[userId+workspaceId+entryId]',
    clockifyCacheMeta: 'key',
  })
  await old.table('githubWorkItems').put({ id: 'github', title: 'keep' })
  await old.table('clockifyEntries').put({ userId: 'user', workspaceId: 'workspace', id: 'clockify' })
  old.close()
  const c = createLinearTicketCache(new DB(name))
  caches.push(c)
  await c.replace('viewer', [issue('one')], c.beginSync(), 'now')
  expect(await c.database.githubWorkItems.get('github')).toMatchObject({ title: 'keep' })
  expect(await c.database.clockifyEntries.get(['user', 'workspace', 'clockify'])).toBeDefined()
  await c.clear()
  expect(await c.database.githubWorkItems.count()).toBe(1)
  expect(await c.database.clockifyEntries.count()).toBe(1)
})

test('known viewer reads persist offline across reopen, but a new session starts unverified', async () => {
  const name = crypto.randomUUID()
  const first = cache(name)
  await first.replace('viewer', [issue('one')], first.beginSync(), 'now')
  first.database.close()
  const reopened = cache(name)
  expect(reopened.getViewer()).toBeNull()
  const observed: string[][] = []
  const subscription = liveQuery(() =>
    queryLinearPage(reopened.database, {
      viewerId: 'viewer',
      clockifyScope: null,
      runningEntries: [],
      sortOrder: 'updated',
      showAll: true,
      now: new Date(),
      limit: 50,
    }),
  ).subscribe(page => observed.push(page.rows.map(row => row.id)))
  try {
    await vi.waitFor(() => expect(observed).toContainEqual(['one']))
    await reopened.replace('viewer', [issue('two')], reopened.beginSync(), 'later')
    await vi.waitFor(() => expect(observed.some(rows => rows.includes('two'))).toBe(true))
  } finally {
    subscription.unsubscribe()
  }
})

test('a failed transaction rolls back and clear increments revision without touching other providers', async () => {
  const c = cache()
  await c.replace('viewer', [issue('one')], c.beginSync(), 'now')
  const before = await c.database.linearCacheMeta.get('state')
  vi.spyOn(c.database.linearTickets, 'put').mockRejectedValueOnce(new Error('disk full'))
  await expect(c.replace('viewer', [issue('two')], c.beginSync(), 'later')).rejects.toThrow('disk full')
  expect((await c.database.linearTickets.toArray()).map(row => row.id)).toEqual(['one'])
  expect(await c.database.linearCacheMeta.get('state')).toEqual(before)
  await c.clear()
  const cleared = await c.database.linearCacheMeta.get('state')
  await c.replace('viewer', [issue('three')], c.beginSync(), 'later')
  const after = await c.database.linearCacheMeta.get('state')
  expect(cleared!.revision).toBeGreaterThan(before!.revision)
  expect(after!.revision).toBeGreaterThan(cleared!.revision)
  expect(after!.sequence).toBeGreaterThan(before!.sequence)
})

test.each(['created', 'updated', 'alphabetical', 'status', 'custom'] as const)(
  '%s pages match the full comparator across equal-date boundaries',
  async (sortOrder: LinearTicketSortOrderOption) => {
    const c = cache()
    const rows = Array.from({ length: 160 }, (_, i) =>
      issue(
        String(i).padStart(3, '0'),
        i < 120 ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z',
        i % 5 === 0 ? 'completed' : 'started',
      ),
    )
    await c.replace('viewer', rows, c.beginSync(), 'now')
    const expected = rows
      .map(toLinearTicket)
      .sort((a, b) => compareLinearTickets(a, b, { sortOrder }, Date.parse('2026-01-10')))
      .map(row => row.id)
    const actual: string[] = []
    let cursor
    do {
      const page = await queryLinearPage(c.database, {
        viewerId: 'viewer',
        clockifyScope: null,
        runningEntries: [],
        sortOrder,
        showAll: true,
        now: new Date('2026-01-10'),
        limit: 13,
        cursor,
      })
      actual.push(...page.rows.map(row => row.id))
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    expect(actual).toEqual(expected)
  },
)

test('page cursors reset after a live revision and scans stop on cancellation', async () => {
  const c = cache()
  await c.replace('viewer', [issue('a'), issue('b')], c.beginSync(), 'now')
  const opts = {
    viewerId: 'viewer',
    clockifyScope: null,
    runningEntries: [],
    sortOrder: 'updated' as const,
    showAll: true,
    now: new Date(),
    limit: 1,
  }
  const page = await queryLinearPage(c.database, opts)
  await c.replace('viewer', [issue('c')], c.beginSync(), 'later')
  expect((await queryLinearPage(c.database, { ...opts, cursor: page.cursor })).reset).toBe(true)
  const controller = new AbortController()
  controller.abort()
  await expect(queryLinearPage(c.database, { ...opts, signal: controller.signal })).rejects.toThrow('cancelled')
})

test('a newer sync aborts an in-progress write transaction', async () => {
  const c = cache()
  await c.replace('viewer', [issue('saved')], c.beginSync(), 'now')
  const original = c.database.linearTickets.put.bind(c.database.linearTickets)
  let current = 0
  vi.spyOn(c.database.linearTickets, 'put').mockImplementationOnce(row =>
    original(row).then(key => {
      current = c.beginSync()
      return key
    }),
  )
  await expect(c.replace('viewer', [issue('stale')], c.beginSync(), 'old')).rejects.toThrow()
  await c.replace('viewer', [issue('fresh')], current, 'new')
  expect((await c.database.linearTickets.toArray()).map(row => row.id).sort()).toEqual(['fresh', 'saved'])
})

test('date-index paging remains bounded on a large viewer archive', async () => {
  const c = cache()
  const rows = Array.from({ length: 3000 }, (_, i) =>
    issue(String(i).padStart(5, '0'), new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
  )
  await c.replace('viewer', rows, c.beginSync(), 'now')
  const started = performance.now()
  const options = {
    viewerId: 'viewer',
    clockifyScope: null,
    runningEntries: [],
    sortOrder: 'updated' as const,
    showAll: true,
    now: new Date(),
    limit: 50,
  }
  const first = await queryLinearPage(c.database, options)
  const firstMs = performance.now() - started
  const next = await queryLinearPage(c.database, { ...options, cursor: first.cursor })
  const secondMs = performance.now() - started - firstMs
  expect(first.rows).toHaveLength(50)
  expect(next.rows).toHaveLength(50)
  expect(new Set([...first.rows, ...next.rows].map(row => row.id)).size).toBe(100)
  console.info(`Linear 3000-row IndexedDB date pages: ${firstMs.toFixed(1)}ms, ${secondMs.toFixed(1)}ms`)
}, 15000)

test('live relevance and summaries move with a tracked entry reference in the selected scope', async () => {
  const c = cache()
  await c.replace('viewer', [issue('1'), issue('2')], c.beginSync(), 'now')
  const clockify = createClockifyEntryCache(c.database)
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const entry = (description: string, entryScope = scope) => ({
    id: 'entry',
    ...entryScope,
    description,
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  })
  await clockify.upsert(entry('ref:linear:acme:TASK-1'), scope)
  const other = { userId: 'other', workspaceId: 'workspace' }
  await clockify.upsert(entry('ref:linear:acme:TASK-2', other), other)
  const observed: Array<Array<[string, number | null]>> = []
  const subscription = liveQuery(() =>
    queryLinearPage(c.database, {
      viewerId: 'viewer',
      clockifyScope: scope,
      runningEntries: [],
      sortOrder: 'custom',
      showAll: true,
      now: new Date('2026-01-02'),
      limit: 50,
    }),
  ).subscribe(page => observed.push(page.rows.map(row => [row.id, row.totalTrackedSeconds])))
  try {
    await vi.waitFor(() => expect(observed).toContainEqual(expect.arrayContaining([['1', 3600]])))
    await clockify.upsert(entry('ref:linear:acme:TASK-2'), scope)
    await vi.waitFor(() => expect(observed).toContainEqual(expect.arrayContaining([['2', 3600]])))
    const latest = observed[observed.length - 1]
    expect(latest.find(row => row[0] === '1')?.[1] ?? 0).toBe(0)
  } finally {
    subscription.unsubscribe()
  }
})

test('a cancelled long relevance scan stops after its current batch', async () => {
  const c = cache()
  await c.replace(
    'viewer',
    Array.from({ length: 300 }, (_, i) => issue(String(i))),
    c.beginSync(),
    'now',
  )
  const controller = new AbortController()
  const original = c.database.linearTickets.where.bind(c.database.linearTickets)
  let reads = 0
  vi.spyOn(c.database.linearTickets, 'where').mockImplementation(index => {
    if (++reads === 1) controller.abort()
    return original(index)
  })
  await expect(
    queryLinearPage(c.database, {
      viewerId: 'viewer',
      clockifyScope: null,
      runningEntries: [],
      sortOrder: 'custom',
      showAll: true,
      now: new Date(),
      limit: 10,
      signal: controller.signal,
    }),
  ).rejects.toThrow('cancelled')
  expect(reads).toBe(1)
})
