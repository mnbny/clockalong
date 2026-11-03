import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { liveQuery } from 'dexie'
import { afterEach, expect, test, vi } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { clockifyEntriesInRange } from '../../../src/services/clockify/entry-queries'
import { DB } from '../../../src/services/db'

const caches: ReturnType<typeof createClockifyEntryCache>[] = []
const scope = { userId: 'user', workspaceId: 'workspace' }
const start = '2026-01-01T00:00:00.000Z'
const end = '2026-01-06T00:00:00.000Z'
function cache(name = crypto.randomUUID()) {
  const result = createClockifyEntryCache(new DB(`clockify-test-${name}`))
  caches.push(result)
  return result
}
function entry(id: string, description = id, date = '2026-01-03T00:00:00Z'): TimeEntryWithRatesDtoV1 {
  return { id, description, ...scope, timeInterval: { start: date, end: '2026-01-04T00:00:00Z' } }
}
afterEach(async () => {
  vi.restoreAllMocks()
  const active = caches.splice(0)
  for (const item of active) item.database.close()
  for (const item of active) await item.database.delete()
})

test('reconciliation retains older rows and cannot delete or overwrite concurrent direct writes', async () => {
  const c = cache()
  for (const value of [
    entry('omitted'),
    entry('returned'),
    entry('stale'),
    entry('old', 'old', '2025-12-01T00:00:00Z'),
  ])
    await c.upsert(value, scope)
  const generation = c.beginSync()
  const revision = await c.getRevision()
  await c.upsert(entry('omitted', 'edited omission'), scope)
  await c.upsert(entry('returned', 'edited payload'), scope)
  await c.upsert(entry('inserted', 'new local'), scope)
  await c.reconcile(scope, [entry('returned', 'stale payload')], start, end, end, generation, revision)
  expect((await c.database.clockifyEntries.get(['user', 'workspace', 'omitted']))?.entry.description).toBe(
    'edited omission',
  )
  expect((await c.database.clockifyEntries.get(['user', 'workspace', 'returned']))?.entry.description).toBe(
    'edited payload',
  )
  expect((await c.database.clockifyEntries.get(['user', 'workspace', 'inserted']))?.entry.description).toBe('new local')
  expect(await c.database.clockifyEntries.get(['user', 'workspace', 'stale'])).toBeUndefined()
  expect(await c.database.clockifyEntries.get(['user', 'workspace', 'old'])).toBeDefined()
})

test('superseded sync, disconnect and transaction failures preserve table isolation', async () => {
  const c = cache()
  await c.upsert(entry('original'), scope)
  const before = c.beginSync()
  const revision = await c.getRevision()
  const newer = c.beginSync()
  await c.reconcile(scope, [entry('new', 'ref:github:owner/repo:issue:1')], start, end, end, newer, revision)
  await expect(c.reconcile(scope, [entry('old')], start, end, end, before, revision)).rejects.toThrow('superseded')
  const failing = c.beginSync()
  const current = await c.getRevision()
  const savedRefs = await c.database.clockifyEntryRefs.toArray()
  vi.spyOn(c.database.clockifyEntryRefs, 'bulkPut').mockRejectedValueOnce(new Error('disk full'))
  await expect(
    c.reconcile(scope, [entry('failure', 'ref:github:owner/repo:issue:2')], start, end, end, failing, current),
  ).rejects.toThrow('disk full')
  expect((await c.database.clockifyEntries.toArray()).map(row => row.id)).toEqual(['new'])
  expect(await c.database.clockifyEntryRefs.toArray()).toEqual(savedRefs)
  expect(await c.getRevision()).toBe(current)
  const late = c.beginSync()
  await c.clear()
  await expect(c.reconcile(scope, [entry('late')], start, end, end, late, current)).rejects.toThrow('superseded')
  expect(await c.database.clockifyEntries.count()).toBe(0)
})

test('reopened offline scope reads normalized dates and reacts to updates', async () => {
  const name = crypto.randomUUID()
  const first = cache(name)
  await first.upsert(entry('one', 'one', '2026-01-02T01:00:00+01:00'), scope)
  first.database.close()
  const reopened = cache(name)
  const observed: string[][] = []
  const subscription = liveQuery(() => clockifyEntriesInRange(reopened.database, scope, start, end)).subscribe(rows =>
    observed.push(rows.map(row => row.entry.description!)),
  )
  try {
    await vi.waitFor(() => expect(observed).toContainEqual(['one']))
    await reopened.upsert(entry('two'), scope)
    await vi.waitFor(() => expect(observed).toContainEqual(['one', 'two']))
  } finally {
    subscription.unsubscribe()
  }
})

test('v2 upgrade keeps GitHub rows and creates Clockify tables', async () => {
  const name = `clockify-v2-${crypto.randomUUID()}`
  const { default: Dexie } = await import('dexie')
  const old = new Dexie(name)
  old.version(2).stores({
    githubWorkItems: 'id,[repositoryFullName+type],refKey',
    githubWorkItemIndex: '[token+updatedAt+rowId],rowId',
    githubAuthors: 'id,[usernameKey+id]',
    githubCacheMeta: 'key',
  })
  await old.table('githubWorkItems').put({ id: 'keep', title: 'preserved' })
  old.close()
  const c = createClockifyEntryCache(new DB(name))
  caches.push(c)
  await c.upsert(entry('clockify'), scope)
  expect(await c.database.githubWorkItems.get('keep')).toMatchObject({ title: 'preserved' })
  await c.clear()
  expect(await c.database.githubWorkItems.get('keep')).toBeDefined()
})

test('window boundaries are inclusive and dates outside remain unchanged', async () => {
  const c = cache()
  for (const value of [
    entry('before', '', '2025-12-31T23:59:59.999Z'),
    entry('start', '', start),
    entry('end', '', end),
    entry('after', '', '2026-01-06T00:00:00.001Z'),
  ])
    await c.upsert(value, scope)
  await c.reconcile(scope, [], start, end, end, c.beginSync(), await c.getRevision())
  expect((await c.database.clockifyEntries.toArray()).map(row => row.id).sort()).toEqual(['after', 'before'])
})

test('indexed summaries include retained history, deduplicate running entries and isolate scopes', async () => {
  const { queryClockifySummaries } = await import('../../../src/services/clockify/entry-queries')
  const c = cache()
  const ref = 'ref:github:owner/repo:issue:1'
  const startTime = '2025-01-01T10:00:00.000Z'
  await c.upsert(
    {
      id: 'old',
      ...scope,
      description: ref,
      hourlyRate: { amount: 12000, currency: 'USD' },
      timeInterval: { start: startTime, end: '2025-01-01T11:00:00Z' },
    },
    scope,
  )
  await c.upsert({ id: 'running', ...scope, description: ref, timeInterval: { start: '2026-01-06T11:00:00Z' } }, scope)
  await c.upsert(
    {
      id: 'other',
      userId: 'other',
      workspaceId: 'workspace',
      description: ref,
      timeInterval: { start: startTime, end: '2025-01-01T11:00:00Z' },
    },
    { userId: 'other', workspaceId: 'workspace' },
  )
  const items = [{ id: 'issue', ref }]
  const running = { id: 'running', ...scope, description: ref, timeInterval: { start: '2026-01-06T11:30:00Z' } }
  const summaries = await queryClockifySummaries(
    c.database,
    scope,
    items,
    item => item.id,
    item => item.ref,
    [running],
    new Date('2026-01-06T12:00:00Z'),
  )
  expect(summaries.issue).toMatchObject({
    totalTrackedSeconds: 5400,
    totalTrackedAmount: 120,
    totalTrackedAmountCurrency: 'USD',
    lastTrackedAt: '2026-01-06T11:30:00Z',
  })
})

test(
  'large cache survives reopen without duplicating rows into memory-owned collections',
  { timeout: 20000 },
  async () => {
    const name = crypto.randomUUID()
    const c = cache(name)
    const rows = Array.from({ length: 1200 }, (_, i) => entry(`large-${i}`, 'x'.repeat(5000)))
    expect(JSON.stringify(rows).length).toBeGreaterThan(5_000_000)
    await c.reconcile(scope, rows, start, end, end, c.beginSync(), await c.getRevision())
    c.database.close()
    const reopened = cache(name)
    expect(await reopened.database.clockifyEntries.count()).toBe(1200)
    expect(
      (await reopened.database.clockifyEntries.get(['user', 'workspace', 'large-1199']))?.entry.description,
    ).toHaveLength(5000)
  },
)

test('a refreshed running response retains its original order for mixed currencies', async () => {
  const { queryClockifySummaries } = await import('../../../src/services/clockify/entry-queries')
  const c = cache()
  const ref = 'ref:github:owner/repo:issue:1'
  const running = {
    id: 'running',
    ...scope,
    description: ref,
    hourlyRate: { amount: 10000, currency: 'EUR' },
    timeInterval: { start: '2026-01-01T10:00:00Z' },
  }
  await c.upsert(running, scope)
  await c.upsert(
    {
      id: 'usd',
      ...scope,
      description: ref,
      hourlyRate: { amount: 10000, currency: 'USD' },
      timeInterval: { start: '2026-01-01T11:00:00Z', end: '2026-01-01T12:00:00Z' },
    },
    scope,
  )
  const items = [{ id: 'issue', ref }]
  const result = await queryClockifySummaries(
    c.database,
    scope,
    items,
    item => item.id,
    item => item.ref,
    [running],
    new Date('2026-01-01T12:00:00Z'),
  )
  expect(result.issue).toMatchObject({
    totalTrackedSeconds: 10800,
    totalTrackedAmount: 200,
    totalTrackedAmountCurrency: 'EUR',
  })
})

test('retained open rows do not accrue time without the authoritative running response', async () => {
  const { queryClockifySummaries } = await import('../../../src/services/clockify/entry-queries')
  const name = crypto.randomUUID()
  const first = cache(name)
  const ref = 'ref:github:owner/repo:issue:1'
  const open = {
    id: 'old-open',
    ...scope,
    description: ref,
    hourlyRate: { amount: 10000, currency: 'USD' },
    timeInterval: { start: '2026-01-01T10:00:00Z' },
  }
  await first.upsert(open, scope)
  await first.upsert({ ...open, id: 'invalid-end', timeInterval: { ...open.timeInterval, end: 'invalid' } }, scope)
  await first.reconcile(
    scope,
    [],
    '2026-02-01T00:00:00.000Z',
    '2026-02-06T12:00:00.000Z',
    end,
    first.beginSync(),
    await first.getRevision(),
  )
  first.database.close()
  const reopened = cache(name)
  const items = [{ id: 'issue', ref }]
  const read = (running: (typeof open)[]) =>
    queryClockifySummaries(
      reopened.database,
      scope,
      items,
      item => item.id,
      item => item.ref,
      running,
      new Date('2026-02-06T12:00:00Z'),
    )
  expect(await reopened.database.clockifyEntries.count()).toBe(2)
  expect((await read([])).issue?.totalTrackedSeconds ?? 0).toBe(0)
  const different = { ...open, id: 'current', timeInterval: { start: '2026-02-06T11:00:00Z' } }
  expect((await read([different])).issue.totalTrackedSeconds).toBe(3600)
  expect((await read([{ ...open, timeInterval: { start: '2026-02-06T11:30:00Z' } }])).issue.totalTrackedSeconds).toBe(
    1800,
  )
})

test('live indexed summaries move from ref A to ref B after an edit without mixing scopes', async () => {
  const { queryClockifySummaries } = await import('../../../src/services/clockify/entry-queries')
  const c = cache()
  const a = 'ref:github:owner/repo:issue:1'
  const b = 'ref:github:owner/repo:issue:2'
  const rows = [
    { id: 'a', ref: a },
    { id: 'b', ref: b },
  ]
  const completed = {
    id: 'entry',
    ...scope,
    description: a,
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  }
  await c.upsert(completed, scope)
  await c.upsert(
    { ...completed, id: 'other', userId: 'other', description: b },
    { userId: 'other', workspaceId: 'workspace' },
  )
  const seen: Array<[number, number]> = []
  const subscription = liveQuery(async () => {
    const totals = await queryClockifySummaries(
      c.database,
      scope,
      rows,
      row => row.id,
      row => row.ref,
      [],
    )
    return [totals.a?.totalTrackedSeconds ?? 0, totals.b?.totalTrackedSeconds ?? 0] as [number, number]
  }).subscribe(value => seen.push(value))
  try {
    await vi.waitFor(() => expect(seen).toContainEqual([3600, 0]))
    await c.upsert({ ...completed, description: b }, scope)
    await vi.waitFor(() => expect(seen).toContainEqual([0, 3600]))
  } finally {
    subscription.unsubscribe()
  }
})

test('a cancelled summary scan stops between indexed batches', async () => {
  const { queryClockifySummaries } = await import('../../../src/services/clockify/entry-queries')
  const c = cache()
  const ref = 'ref:github:owner/repo:issue:1'
  const entries = Array.from({ length: 251 }, (_, i) => ({
    ...entry(`row-${i}`, ref),
    timeInterval: { start: '2026-01-03T00:00:00Z', end: '2026-01-03T01:00:00Z' },
  }))
  await c.reconcile(scope, entries, start, end, end, c.beginSync(), await c.getRevision())
  const controller = new AbortController()
  const resolve = vi.fn(async (values: TimeEntryWithRatesDtoV1[]) => {
    if (values.length) controller.abort()
    return new Map(values.map(value => [value.id!, 'item']))
  })
  await expect(
    queryClockifySummaries(
      c.database,
      scope,
      [{ id: 'item', ref }],
      item => item.id,
      item => item.ref,
      [],
      new Date(),
      Infinity,
      controller.signal,
      resolve,
    ),
  ).rejects.toThrow('cancelled')
  expect(resolve.mock.calls.filter(([values]) => values.length).map(([values]) => values.length)).toEqual([250])
})
