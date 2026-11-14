import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { afterEach, expect, test, vi } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { queryClockifySummaries } from '../../../src/services/clockify/entry-queries'
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

test('deletion removes scoped rows and references without letting an older sync restore them', async () => {
  const c = cache()
  const removed = entry('removed', 'ref:linear:acme:TEST-1')
  const otherScope = { ...scope, workspaceId: 'other-workspace' }
  await c.upsert(removed, scope)
  await c.upsert({ ...removed, workspaceId: otherScope.workspaceId }, otherScope)
  await c.upsert(entry('kept'), scope)
  const pendingSync = c.beginSync()
  const revision = await c.getRevision()

  await expect(c.remove(removed.id!, scope)).resolves.toBe(true)
  await expect(c.reconcile(scope, [removed], start, end, end, pendingSync, revision)).rejects.toThrow('superseded')
  expect(await c.database.clockifyEntries.get([scope.userId, scope.workspaceId, removed.id!])).toBeUndefined()
  expect(await c.database.clockifyEntries.get([scope.userId, scope.workspaceId, 'kept'])).toBeDefined()
  expect(await c.database.clockifyEntryRefs.toArray()).toMatchObject([{ ...otherScope, entryId: removed.id }])
  expect(await c.database.clockifyEntries.get([otherScope.userId, otherScope.workspaceId, removed.id!])).toBeDefined()
  expect(await c.getRevision()).toBeGreaterThan(revision)
})

test('a deletion response from an old session cannot remove a new session entry', async () => {
  const c = cache()
  const lifecycle = c.getLifecycle()
  await c.clear()
  await c.upsert(entry('same-id', 'ref:linear:acme:TEST-1'), scope)
  const revision = await c.getRevision()

  await expect(c.remove('same-id', scope, lifecycle)).resolves.toBe(false)
  expect(await c.database.clockifyEntries.get([scope.userId, scope.workspaceId, 'same-id'])).toBeDefined()
  expect(await c.database.clockifyEntryRefs.count()).toBe(1)
  expect(await c.getRevision()).toBe(revision)
})

test('indexed summaries include retained history, deduplicate running entries and isolate scopes', async () => {
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

test('a refreshed running response retains its original order for mixed currencies', async () => {
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
