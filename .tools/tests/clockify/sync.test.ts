import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockify, clockifyReports } from '../../../src/services/clockify/client'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import {
  cacheClockifyEntryResult,
  clearSyncedClockifyTimeEntries,
  getClockifyEntrySyncStart,
  syncClockifyEntries,
} from '../../../src/services/clockify/sync'
import { db } from '../../../src/services/db'
import { storage } from '../../../src/services/storage/config'

const scope = { userId: 'user', workspaceId: 'workspace' }
function entry(id: string | undefined, overrides: Partial<TimeEntryWithRatesDtoV1> = {}): TimeEntryWithRatesDtoV1 {
  return {
    id,
    userId: 'user',
    workspaceId: 'workspace',
    description: `Entry ${id}`,
    timeInterval: {
      start: new Date(Date.now() - 86400000).toISOString(),
      end: new Date(Date.now() - 82800000).toISOString(),
    },
    ...overrides,
  }
}
async function store(value: TimeEntryWithRatesDtoV1) {
  await cacheClockifyEntryResult(value)
}

beforeEach(() => {
  vi.spyOn(clockifyReports, 'generateDetailedReport').mockImplementation(async () => ({ totals: [], timeentries: [] }))
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  queryClient.clear()
  await clearSyncedClockifyTimeEntries()
})

test('changing the selected account while a fetch is in flight prevents the old result from being stored', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }, { id: 'new-workspace' }])
  let release!: (rows: TimeEntryWithRatesDtoV1[]) => void
  const read = vi.spyOn(clockify, 'getTimeEntries').mockReturnValue(
    new Promise(resolve => {
      release = resolve
    }),
  )
  const pending = syncClockifyEntries(scope)
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'other', activeWorkspace: 'new-workspace' })
  release([entry('late')])
  await expect(pending).rejects.toThrow('account or workspace changed')
  expect(await db.clockifyEntries.count()).toBe(0)
})

test('a full paginated sync commits compact rows and preserves entries inserted during pagination', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  await store(entry('stale'))
  await cacheClockifyEntryResult(entry('other', { userId: 'other', workspaceId: 'other-workspace' }))
  const firstPage = Array.from({ length: 100 }, (_, i) => ({
    ...entry(`p1-${i}`),
    unusedProviderPayload: 'not stored',
  }))
  const read = vi.spyOn(clockify, 'getTimeEntries').mockImplementation(async request => {
    if (request.queries?.page === 1) return firstPage
    await store(entry('concurrent'))
    return [entry('final'), entry(undefined)]
  })
  const result = await syncClockifyEntries(scope)
  expect(result).toMatchObject({ pagesFetched: 2, entriesFetched: 102, skippedEntries: 1, entriesDeleted: 1 })
  expect(read).toHaveBeenCalledTimes(2)
  for (const [request] of read.mock.calls) {
    expect(request.params).toEqual({ workspaceId: 'workspace', userId: 'user' })
    expect(request.queries).toMatchObject({ hydrated: true, 'page-size': 100, start: expect.any(String) })
    expect(request.queries).not.toHaveProperty('end')
  }
  expect(await db.clockifyEntries.get(['user', 'workspace', 'stale'])).toBeUndefined()
  expect(await db.clockifyEntries.get(['user', 'workspace', 'concurrent'])).toBeDefined()
  expect(await db.clockifyEntries.get(['other', 'other-workspace', 'other'])).toBeDefined()
  expect(await db.clockifyEntries.get(['user', 'workspace', 'final'])).toBeDefined()
  expect((await db.clockifyEntries.get(['user', 'workspace', 'p1-0']))?.entry).not.toHaveProperty(
    'unusedProviderPayload',
  )
})

test('a failed later page leaves existing rows untouched and does not persist earlier pages', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  await store(entry('stale'))
  vi.spyOn(clockify, 'getTimeEntries')
    .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => entry(`page-${i}`)))
    .mockRejectedValueOnce(new Error('page failed'))
  await expect(syncClockifyEntries(scope)).rejects.toThrow('page failed')
  expect((await db.clockifyEntries.toArray()).map(row => row.id)).toEqual(['stale'])
})

test('lookback uses local calendar days across both daylight-saving transitions', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    expect(getClockifyEntrySyncStart(5, new Date('2025-03-12T19:00:00Z')).toISOString()).toBe(
      '2025-03-07T20:00:00.000Z',
    )
    expect(getClockifyEntrySyncStart(5, new Date('2025-11-05T20:00:00Z')).toISOString()).toBe(
      '2025-10-31T19:00:00.000Z',
    )
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('sync paginates invoiced IDs for the same user and local date range and retains collapse metadata', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key => storage.config[key].default)
  const start = new Date('2026-11-01T07:00:00Z')
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', settings: { timeZone: 'America/Los_Angeles' } })
  const completed = { start: '2026-11-02T18:00:00Z', end: '2026-11-02T18:00:05Z' }
  vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([
    entry('invoiced', { timeInterval: completed }),
    entry('available', {
      timeInterval: completed,
      customFieldValues: [{ customFieldId: 'field', value: { selection: 'value' } }],
      costRate: { amount: 300, currency: 'USD' },
      isLocked: true,
    }),
    entry('running', { timeInterval: { start: completed.start } }),
    entry('outside', { timeInterval: { start: '2026-10-01T00:00:00Z', end: '2026-10-01T00:00:05Z' } }),
  ])
  const reports = vi
    .mocked(clockifyReports.generateDetailedReport)
    .mockImplementationOnce(async () => ({
      totals: [],
      timeentries: Array.from({ length: 100 }, (_, i) => ({ _id: 'other-' + i })),
    }))
    .mockImplementationOnce(async () => ({ totals: [], timeentries: [{ _id: 'invoiced' }] }))
  expect(await syncClockifyEntries({ ...scope, start })).toMatchObject({ invoiceStatusFailed: false })
  expect(reports.mock.calls.map(([body]) => body.detailedFilter?.page)).toEqual([1, 2])
  for (const [body, request] of reports.mock.calls) {
    expect(body).toMatchObject({
      dateRangeStart: '2026-11-01T00:00:00.000',
      timeZone: 'America/Los_Angeles',
      invoicingState: 'INVOICED',
      rounding: false,
      users: { ids: ['user'], contains: 'CONTAINS', status: 'ALL' },
    })
    expect(body.dateRangeEnd).not.toMatch(/Z$/)
    expect(request.params).toEqual({ workspaceId: 'workspace' })
  }
  const cached = async (id: string) => (await db.clockifyEntries.get(['user', 'workspace', id]))?.entry
  expect((await cached('invoiced'))?.invoiced).toBe(true)
  expect(await cached('available')).toMatchObject({
    invoiced: false,
    customFieldValues: [{ customFieldId: 'field', value: { selection: 'value' } }],
    costRate: { amount: 300, currency: 'USD' },
    isLocked: true,
  })
  expect((await cached('running'))?.invoiced).toBeUndefined()
  expect((await cached('outside'))?.invoiced).toBeUndefined()
})

test('failed or malformed invoice pages leave statuses unknown while completing the entry sync', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key => storage.config[key].default)
  const original = entry('original')
  await clockifyEntryCache.upsert({ ...original, invoiced: false }, scope)
  vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([original])
  const reports = vi
    .mocked(clockifyReports.generateDetailedReport)
    .mockImplementationOnce(async () => ({
      totals: [],
      timeentries: Array.from({ length: 100 }, () => ({ _id: 'original' })),
    }))
    .mockRejectedValueOnce(new Error('Reports unavailable'))
  expect(await syncClockifyEntries(scope)).toMatchObject({ invoiceStatusFailed: true, entriesStored: 1 })
  expect((await db.clockifyEntries.get(['user', 'workspace', 'original']))?.entry.invoiced).toBeUndefined()
  reports.mockResolvedValueOnce({ totals: [] })
  expect(await syncClockifyEntries(scope)).toMatchObject({ invoiceStatusFailed: true, entriesStored: 1 })
  expect((await db.clockifyEntries.get(['user', 'workspace', 'original']))?.entry.invoiced).toBeUndefined()
})

test('a direct edit made while a page is in flight is neither deleted nor overwritten', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  await store(entry('omitted', { description: 'before' }))
  await store(entry('returned', { description: 'before' }))
  let release!: (rows: TimeEntryWithRatesDtoV1[]) => void
  const fetching = new Promise<TimeEntryWithRatesDtoV1[]>(resolve => {
    release = resolve
  })
  const read = vi.spyOn(clockify, 'getTimeEntries').mockReturnValue(fetching)
  const sync = syncClockifyEntries(scope)
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  await store(entry('omitted', { description: 'new omission' }))
  await store(entry('returned', { description: 'new payload' }))
  release([entry('returned', { description: 'old payload' })])
  await sync
  expect((await db.clockifyEntries.get(['user', 'workspace', 'omitted']))?.entry.description).toBe('new omission')
  expect((await db.clockifyEntries.get(['user', 'workspace', 'returned']))?.entry.description).toBe('new payload')
})

test('disconnect during an in-flight fetch cannot repopulate the cache', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  let release!: (rows: TimeEntryWithRatesDtoV1[]) => void
  const read = vi.spyOn(clockify, 'getTimeEntries').mockReturnValue(
    new Promise(resolve => {
      release = resolve
    }),
  )
  const pending = syncClockifyEntries(scope)
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  await clearSyncedClockifyTimeEntries()
  release([entry('late')])
  await expect(pending).rejects.toThrow('superseded')
  expect(await db.clockifyEntries.count()).toBe(0)
})
