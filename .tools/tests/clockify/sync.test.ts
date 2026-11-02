import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockify } from '../../../src/services/clockify/client'
import {
  cacheClockifyEntryResult,
  clearSyncedClockifyTimeEntries,
  clockifyEntrySyncQueryOptions,
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

afterEach(async () => {
  vi.restoreAllMocks()
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

test('manual sync still fetches once when the account becomes ready', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  const read = vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([entry('initial')])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const options = clockifyEntrySyncQueryOptions({ ...scope, enabled: true, interval: 'manual' })
  const observer = new QueryObserver(client, options)
  try {
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = observer.subscribe(result => {
        if (result.isSuccess) {
          unsubscribe()
          resolve()
        } else if (result.isError) {
          unsubscribe()
          reject(result.error)
        }
      })
    })
    expect(options.refetchInterval).toBe(false)
    expect(read).toHaveBeenCalledTimes(1)
    expect(await db.clockifyEntries.get(['user', 'workspace', 'initial'])).toBeDefined()
  } finally {
    observer.destroy()
    client.clear()
  }
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

test('a partial successful timer response retains the original identity and fields', async () => {
  const original = entry('timer', { description: 'tracked work', timeInterval: { start: '2026-01-01T10:00:00Z' } })
  await cacheClockifyEntryResult({ timeInterval: { end: '2026-01-01T11:00:00Z' } }, original)
  expect((await db.clockifyEntries.get(['user', 'workspace', 'timer']))?.entry).toMatchObject({
    id: 'timer',
    description: 'tracked work',
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  })
})
