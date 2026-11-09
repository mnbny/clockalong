import type { TimeEntryDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockify, clockifyReports } from '../../../src/services/clockify/client'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { fixClockifyMonthOverlaps } from '../../../src/services/clockify/overlap-repair'
import { hasCompletedClockifyTimeEntryOverlap } from '../../../src/services/clockify/overlaps'
import { syncClockifyEntries } from '../../../src/services/clockify/sync'
import { db } from '../../../src/services/db'
import { storage } from '../../../src/services/storage/config'

const scope = { userId: 'user', workspaceId: 'workspace' }

function entry(id: string, start = '2026-10-02T12:00:00Z', end = '2026-10-02T13:00:00Z'): TimeEntryDtoV1 {
  return {
    ...scope,
    id,
    billable: true,
    customFieldValues: [],
    description: `Task ${id}`,
    isLocked: false,
    kioskId: '',
    projectId: 'project',
    tagIds: ['tag'],
    taskId: 'task',
    timeInterval: { start, end },
    type: 'REGULAR',
  }
}

async function server(initial: TimeEntryDtoV1[]) {
  for (const value of initial) await clockifyEntryCache.upsert(value, scope)
  const entries = new Map(initial.map(value => [value.id, value]))
  const read = vi.spyOn(clockify, 'getTimeEntries').mockImplementation(async () => [...entries.values()])
  const replace = (body: Parameters<typeof clockify.replaceMany>[0]) =>
    body.map(update => {
      const value = { ...entries.get(update.id)!, timeInterval: { start: update.start, end: update.end } }
      entries.set(update.id, value)
      return value
    })
  const write = vi.spyOn(clockify, 'replaceMany').mockImplementation(async body => replace(body))
  return { read, write, replace }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-31T18:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(clockifyReports, 'generateDetailedReport').mockImplementation(async () => ({ totals: [], timeentries: [] }))
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'clockifyEntrySyncDays' ? 5 : storage.config[key].default,
  )
  queryClient.setQueryData(queryKeys.clockify.loggedUser, {
    id: 'user',
    activeWorkspace: 'workspace',
    settings: { timeZone: 'UTC' },
  })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  queryClient.clear()
  await clockifyEntryCache.clear()
})

test('repair plans from cache, then refreshes the whole month despite a five-day sync window', async () => {
  await clockifyEntryCache.upsert(entry('prior-month', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z'), scope)
  const fixture = await server([
    entry('first'),
    entry('overlap'),
    entry('later', '2026-10-31T10:00:00Z', '2026-10-31T11:00:00Z'),
    { ...entry('running'), timeInterval: { start: '2026-10-31T17:00:00Z' } },
    entry('future', '2026-11-01T12:00:00Z', '2026-11-01T13:00:00Z'),
    entry('future-overlap', '2026-11-01T12:00:00Z', '2026-11-01T13:00:00Z'),
  ])
  const reports = vi.spyOn(queryClient, 'invalidateQueries')
  const cacheWrite = vi.spyOn(clockifyEntryCache, 'upsert')
  fixture.write.mockImplementation(async body => {
    expect(fixture.read).not.toHaveBeenCalled()
    expect((await db.clockifyEntries.get(['user', 'workspace', 'overlap']))?.entry.timeInterval?.start).toBe(
      '2026-10-02T12:00:00Z',
    )
    return fixture.replace(body)
  })

  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 1, refreshFailed: false })
  expect(fixture.read).toHaveBeenCalledTimes(1)
  for (const [request] of fixture.read.mock.calls) {
    expect(request.params).toEqual(scope)
    expect(request.queries?.start).toBe('2026-10-01T00:00:00.000Z')
  }
  expect(fixture.write).toHaveBeenCalledExactlyOnceWith(
    [expect.objectContaining({ id: 'overlap', start: '2026-10-02T13:00:00.000Z', end: '2026-10-02T14:00:00.000Z' })],
    { params: scope },
  )
  expect(await db.clockifyEntries.get(['user', 'workspace', 'prior-month'])).toBeDefined()
  expect(cacheWrite).not.toHaveBeenCalled()
  expect(reports).toHaveBeenCalledWith({ queryKey: queryKeys.clockify.summaryReport() }, { throwOnError: true })
})

test('an uncertain bulk failure refreshes the entire month after earlier batches succeeded', async () => {
  const fixture = await server(Array.from({ length: 27 }, (_, index) => entry(`entry-${index}`)))
  fixture.write
    .mockImplementationOnce(async body => fixture.replace(body))
    .mockImplementationOnce(async body => {
      fixture.replace(body)
      throw new Error('Connection lost after submission')
    })

  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).rejects.toThrow('Connection lost after submission')
  expect(fixture.write.mock.calls.map(([body]) => body.length)).toEqual([25, 1])
  expect(fixture.read).toHaveBeenCalledTimes(1)
  const cached = await db.clockifyEntries.toArray()
  expect(cached).toHaveLength(27)
  expect(hasCompletedClockifyTimeEntryOverlap(cached.map(row => row.entry))).toBe(false)
})

test.each([
  ['America/Los_Angeles', '2026-11-08T20:00:00Z', '2026-11-01T07:00:00Z', '2026-11-01T00:00:00Z'],
  ['America/Los_Angeles', '2026-03-31T20:00:00Z', '2026-03-01T08:00:00Z', '2026-03-01T00:00:00Z'],
  ['Asia/Kolkata', '2026-02-08T20:00:00Z', '2026-01-31T18:30:00Z', '2026-02-01T00:00:00Z'],
])(
  'month-boundary repairs use local API filters and UTC cache boundaries in %s at %s',
  async (timeZone, now, start, filterStart) => {
    vi.setSystemTime(new Date(now))
    queryClient.setQueryData(queryKeys.clockify.loggedUser, {
      id: 'user',
      activeWorkspace: 'workspace',
      settings: { timeZone },
    })
    const boundary = Date.parse(start)
    const at = (seconds: number) => new Date(boundary + seconds * 1000).toISOString()
    await clockifyEntryCache.upsert(entry('prior-month', at(-30), at(-20)), scope)
    const fixture = await server([
      entry('anchor', at(120), at(130)),
      entry('overlap-one', at(125), at(135)),
      entry('overlap-two', at(130), at(140)),
    ])
    const readServer = fixture.read.getMockImplementation()!
    // Model the API's local-clock filter independently from the application's formatter.
    const offset = boundary - Date.parse(filterStart)
    fixture.read.mockImplementation(async request => {
      const utcFilter = Date.parse(request.queries!.start!) + offset
      return (await readServer(request)).filter(value => Date.parse(value.timeInterval!.start!) >= utcFilter)
    })

    await expect(fixClockifyMonthOverlaps(scope, timeZone)).resolves.toEqual({ updatedCount: 2, refreshFailed: false })
    expect(fixture.write).toHaveBeenCalledExactlyOnceWith(
      [
        expect.objectContaining({ id: 'overlap-one', start: at(130), end: at(140) }),
        expect.objectContaining({ id: 'overlap-two', start: at(140), end: at(150) }),
      ],
      { params: scope },
    )
    expect(await db.clockifyEntries.get(['user', 'workspace', 'prior-month'])).toBeDefined()
    const rows = (await db.clockifyEntries.toArray()).filter(row => row.startedAt >= start)
    expect(rows).toHaveLength(3)
    expect(hasCompletedClockifyTimeEntryOverlap(rows.map(row => row.entry))).toBe(false)
  },
)

test('remote-only overlaps are not fetched or repaired until they reach the cache', async () => {
  const read = vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([entry('first'), entry('overlap')])
  const write = vi.spyOn(clockify, 'replaceMany')
  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 0, refreshFailed: false })
  expect(read).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
})

test('concurrent repairs share one operation and wait for background sync only before refreshing', async () => {
  const entries = [entry('first'), entry('overlap')]
  const fixture = await server(entries)
  let release!: (entries: TimeEntryDtoV1[]) => void
  fixture.read.mockImplementationOnce(() => new Promise(resolve => (release = resolve)))
  const background = queryClient.fetchQuery({
    queryKey: queryKeys.clockify.entrySync({ params: scope }),
    queryFn: () => syncClockifyEntries(scope),
  })
  await vi.waitFor(() => expect(fixture.read).toHaveBeenCalledOnce())
  const first = fixClockifyMonthOverlaps(scope, 'UTC')
  const second = fixClockifyMonthOverlaps(scope, 'UTC')
  expect(second).toBe(first)
  await expect(fixClockifyMonthOverlaps({ ...scope, userId: 'other' }, 'UTC')).rejects.toThrow('in progress')
  await vi.waitFor(() => expect(fixture.write).toHaveBeenCalledOnce())
  release(entries)
  await expect(background).resolves.toMatchObject({ entriesFetched: 2 })
  await expect(first).resolves.toEqual({ updatedCount: 1, refreshFailed: false })
  expect(fixture.write).toHaveBeenCalledOnce()
  expect(fixture.read).toHaveBeenCalledTimes(2)

  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 0, refreshFailed: false })
  expect(fixture.write).toHaveBeenCalledOnce()
})

test('a month without overlaps succeeds without writing', async () => {
  const fixture = await server([entry('only')])
  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 0, refreshFailed: false })
  expect(fixture.write).not.toHaveBeenCalled()
})

test('a refresh failure preserves the confirmed repair count and reports stale display data', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fixture = await server([entry('first'), entry('overlap')])
  fixture.read.mockRejectedValue(new Error('Offline'))

  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 1, refreshFailed: true })
  expect(fixture.write).toHaveBeenCalledOnce()
  expect((await db.clockifyEntries.get(['user', 'workspace', 'overlap']))?.entry.timeInterval).toMatchObject({
    start: '2026-10-02T12:00:00Z',
    end: '2026-10-02T13:00:00Z',
  })
})

test('invoiced entries are still eligible for overlap repair', async () => {
  const fixture = await server([entry('first'), entry('overlap')])
  await clockifyEntryCache.upsert({ ...entry('overlap'), invoiced: true }, scope)
  await expect(fixClockifyMonthOverlaps(scope, 'UTC')).resolves.toEqual({ updatedCount: 1, refreshFailed: false })
  expect(fixture.write).toHaveBeenCalledOnce()
})
