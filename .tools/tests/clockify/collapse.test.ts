import type { StoredClockifyTimeEntry } from '../../../src/services/clockify/entry-cache'
import type { AxiosAdapter } from 'axios'

import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockify, clockifyReports } from '../../../src/services/clockify/client'
import { defaultClockifyCollapseOptions, getClockifyCollapseGroups } from '../../../src/services/clockify/collapse'
import { collapseClockifyMonthEntries } from '../../../src/services/clockify/collapse-entries'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { db } from '../../../src/services/db'
import { storage } from '../../../src/services/storage/config'

vi.mock('../../../src/services/clockify/auth', () => ({
  getTauriClockifyApiKey: async () => ({ apiKey: 'test-key' }),
}))

const scope = { userId: 'user', workspaceId: 'workspace' }
function entry(
  id: string,
  time = '10:17',
  seconds = 5,
  overrides: Partial<StoredClockifyTimeEntry> = {},
): StoredClockifyTimeEntry {
  const start = new Date('2026-11-02T' + time + ':00Z')
  return {
    id,
    ...scope,
    description: 'Task ref:linear:acme:TASK-1',
    projectId: 'project',
    taskId: 'task',
    billable: true,
    tagIds: ['tag'],
    type: 'REGULAR',
    invoiced: false,
    timeInterval: { start: start.toISOString(), end: new Date(start.getTime() + seconds * 1000).toISOString() },
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(storage, 'get').mockImplementation(async key => storage.config[key].default)
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
  await db.clockifyCollapses.clear()
})

async function server(initial = [entry('a'), entry('b', '10:40', 17)]) {
  for (const value of initial) await clockifyEntryCache.upsert(value, scope)
  const entries = new Map(initial.map(value => [value.id!, value]))
  const reads = vi.spyOn(clockify, 'getTimeEntries').mockImplementation(async () => [...entries.values()])
  vi.spyOn(clockifyReports, 'generateDetailedReport').mockImplementation(async () => ({
    totals: [],
    timeentries: [...entries.values()].filter(value => value.invoiced).map(value => ({ _id: value.id })),
  }))
  let replacements = 0
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async body => {
    const id = ++replacements === 1 ? 'replacement' : 'replacement-' + replacements
    const value = entry(id, '10:17', 22, {
      ...body,
      tagIds: body.tagIds ? [...body.tagIds] : undefined,
      customFieldValues: body.customFields?.map(field => ({ ...field })),
      timeInterval: { start: body.start, end: body.end },
    })
    entries.set(value.id!, value)
    return value
  })
  const remove = vi.spyOn(clockify, 'deleteMany').mockImplementation(async (_body, request) => {
    return request.queries['time-entry-ids'].flatMap(id => {
      const value = entries.get(id)
      entries.delete(id)
      return value ? [value] : []
    })
  })
  return { entries, reads, create, remove }
}

test('chunks start at the first eligible entry, do not slide, and preserve the exact sum above the threshold', () => {
  const groups = getClockifyCollapseGroups(
    [
      entry('next', '11:17', 5),
      entry('a', '10:17', 300),
      entry('b', '10:50', 17),
      entry('too-long', '10:20', 301),
      entry('c', '11:16', 120),
      entry('next-2', '11:20', 5),
    ],
    defaultClockifyCollapseOptions,
  )
  expect(groups.map(group => group.entries.map(value => value.id))).toEqual([
    ['a', 'b', 'c'],
    ['next', 'next-2'],
  ])
  expect(groups[0]).toMatchObject({ start: '2026-11-02T10:17:00.000Z', end: '2026-11-02T10:24:17.000Z' })
  expect(
    getClockifyCollapseGroups([entry('a'), entry('b', '10:46'), entry('c', '10:47')], {
      ...defaultClockifyCollapseOptions,
      chunkMinutes: 30,
    })[0].entries.map(value => value.id),
  ).toEqual(['a', 'b'])
})

test('invoice protection excludes invoiced and unknown entries and can be disabled', () => {
  const entries = [
    entry('a'),
    entry('b', '10:20', 5, { invoiced: true }),
    entry('c', '10:30', 5, { invoiced: undefined }),
  ]
  expect(getClockifyCollapseGroups(entries, defaultClockifyCollapseOptions)).toEqual([])
  expect(
    getClockifyCollapseGroups(entries, { ...defaultClockifyCollapseOptions, excludeInvoiced: false })[0].entries,
  ).toHaveLength(3)
  expect(
    getClockifyCollapseGroups(
      [
        entry('a'),
        entry('running', '10:20', 5, { timeInterval: { start: '2026-11-02T10:20:00Z' } }),
        entry('zero', '10:30', 0),
      ],
      { ...defaultClockifyCollapseOptions, excludeInvoiced: false },
    ),
  ).toEqual([])
})

test.each([
  { projectId: 'other' },
  { taskId: 'other' },
  { description: 'Other notes' },
  { billable: false },
  { tagIds: ['other'] },
  { hourlyRate: { amount: 500, currency: 'USD' } },
  { customFieldValues: [{ customFieldId: 'field', value: { value: 'other' } }] },
])('different tracking or billing details stay in separate groups: %j', overrides => {
  const groups = getClockifyCollapseGroups(
    [entry('a'), entry('b'), entry('c', '10:20', 5, overrides), entry('d', '10:21', 5, overrides)],
    defaultClockifyCollapseOptions,
  )
  expect(groups.map(group => group.entries.map(value => value.id))).toEqual([
    ['a', 'b'],
    ['c', 'd'],
  ])
})

test('collapse creates at the first start, deletes only after confirmation, and only sync writes the entry cache', async () => {
  const fixture = await server()
  const upsert = vi.spyOn(clockifyEntryCache, 'upsert')
  const singleDelete = vi.spyOn(clockify, 'deleteTimeEntry')
  const create = fixture.create.getMockImplementation()!
  const remove = fixture.remove.getMockImplementation()!
  fixture.create.mockImplementation(async (body, request) => {
    expect(fixture.reads).not.toHaveBeenCalled()
    return create(body, request)
  })
  fixture.remove.mockImplementation(async (_body, request) => {
    expect(fixture.entries.has('replacement')).toBe(true)
    for (const id of request.queries['time-entry-ids']) {
      expect(await db.clockifyEntries.get(['user', 'workspace', id])).toBeDefined()
    }
    return remove(_body, request)
  })
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 1,
    deletedCount: 2,
    refreshFailed: false,
  })
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      start: '2026-11-02T10:17:00.000Z',
      end: '2026-11-02T10:17:22.000Z',
      projectId: 'project',
      taskId: 'task',
      billable: true,
      tagIds: ['tag'],
    }),
    { params: { workspaceId: 'workspace' } },
  )
  expect(fixture.remove).toHaveBeenCalledExactlyOnceWith(undefined, {
    params: scope,
    queries: { 'time-entry-ids': ['a', 'b'] },
  })
  expect(singleDelete).not.toHaveBeenCalled()
  expect(fixture.reads).toHaveBeenCalledOnce()
  expect(upsert).not.toHaveBeenCalled()
  expect((await db.clockifyEntries.toArray()).map(row => row.id)).toEqual(['replacement'])
  expect(await db.clockifyCollapses.count()).toBe(0)
})

test('large groups use bounded batches and each group gets its replacement before deletion', async () => {
  const originals = Array.from({ length: 27 }, (_, index) => entry('entry-' + index, '10:' + (17 + index)))
  const fixture = await server([...originals, entry('next-a', '11:30'), entry('next-b', '11:40')])
  const remove = fixture.remove.getMockImplementation()!
  fixture.remove.mockImplementation(async (body, request) => {
    const nextGroup = request.queries['time-entry-ids'].includes('next-a')
    expect(fixture.create).toHaveBeenCalledTimes(nextGroup ? 2 : 1)
    expect(fixture.entries.has(nextGroup ? 'replacement-2' : 'replacement')).toBe(true)
    return remove(body, request)
  })

  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 2,
    deletedCount: 29,
    refreshFailed: false,
  })
  expect(fixture.remove.mock.calls.map(([, request]) => request.queries['time-entry-ids'])).toEqual([
    originals.slice(0, 25).map(value => value.id),
    originals.slice(25).map(value => value.id),
    ['next-a', 'next-b'],
  ])
  expect([...fixture.entries.keys()]).toEqual(['replacement', 'replacement-2'])
  expect(fixture.reads).toHaveBeenCalledOnce()
})

test('an incomplete bulk response saves confirmed deletions and retries only the remaining originals', async () => {
  const fixture = await server([entry('a'), entry('b', '10:30'), entry('c', '10:40')])
  fixture.remove.mockImplementationOnce(async () => {
    const deleted = fixture.entries.get('a')!
    fixture.entries.delete('a')
    return [deleted]
  })
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('did not confirm every deletion')
  expect(fixture.remove).toHaveBeenCalledOnce()
  expect((await db.clockifyCollapses.toArray())[0].groups[0].deletedIds).toEqual(['a'])

  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toMatchObject({
    createdCount: 1,
    deletedCount: 3,
  })
  expect(fixture.remove).toHaveBeenLastCalledWith(undefined, {
    params: scope,
    queries: { 'time-entry-ids': ['b', 'c'] },
  })
  expect(fixture.create).toHaveBeenCalledOnce()
  expect([...fixture.entries.keys()]).toEqual(['replacement'])
})

test.each([{ removed: ['a'] }, { removed: ['a', 'b'] }])(
  'a lost bulk response uses the completed resync to recover deletions: $removed',
  async ({ removed }) => {
    const fixture = await server()
    fixture.remove.mockImplementationOnce(async () => {
      for (const id of removed) fixture.entries.delete(id)
      throw new Error('Response lost')
    })
    await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Response lost')
    expect((await db.clockifyCollapses.toArray())[0].groups[0].deletedIds).toEqual(removed)

    await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
      createdCount: 1,
      deletedCount: 2,
      refreshFailed: false,
    })
    if (removed.length === 1) {
      expect(fixture.remove).toHaveBeenLastCalledWith(undefined, {
        params: scope,
        queries: { 'time-entry-ids': ['b'] },
      })
    }
    expect(fixture.remove).toHaveBeenCalledTimes(removed.length === 1 ? 2 : 1)
    expect(fixture.create).toHaveBeenCalledOnce()
    expect([...fixture.entries.keys()]).toEqual(['replacement'])
    expect(await db.clockifyCollapses.count()).toBe(0)
  },
)

test('a failed resync cannot confirm deletions after a lost bulk response', async () => {
  const fixture = await server()
  fixture.remove.mockImplementationOnce(async () => {
    fixture.entries.delete('a')
    throw new Error('Response lost')
  })
  fixture.reads.mockRejectedValueOnce(new Error('Offline'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Response lost')
  expect((await db.clockifyCollapses.toArray())[0].groups[0]).toMatchObject({
    createdId: 'replacement',
    deletedIds: [],
  })
  expect((await db.clockifyEntries.toArray()).map(row => row.id)).toEqual(['a', 'b'])
})

test('a bulk 404 does not count the whole batch as deleted', async () => {
  const fixture = await server()
  fixture.remove.mockRejectedValueOnce(
    new AxiosError('Not found', undefined, undefined, undefined, {
      config: { headers: new AxiosHeaders() },
      data: {},
      headers: {},
      status: 404,
      statusText: 'Not Found',
    }),
  )
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Not found')
  expect((await db.clockifyCollapses.toArray())[0].groups[0].deletedIds).toEqual([])
  expect([...fixture.entries.keys()]).toEqual(['a', 'b', 'replacement'])
})

test('the generated bulk delete client sends scoped IDs as repeated query parameters', async () => {
  const fixture = await server()
  fixture.remove.mockRestore()
  const originalAdapter = clockify.axios.defaults.adapter
  const adapter = vi.fn<AxiosAdapter>(async config => {
    const url = new URL(clockify.axios.getUri(config))
    expect(config.method).toBe('delete')
    expect(url.pathname).toBe('/api/v1/workspaces/workspace/user/user/time-entries')
    const ids = url.searchParams.getAll('time-entry-ids')
    expect(ids).toEqual(['a', 'b'])
    expect(config.data).toBeUndefined()
    const deleted = ids.map(id => fixture.entries.get(id)!)
    for (const id of ids) fixture.entries.delete(id)
    return { config, data: deleted, headers: {}, status: 200, statusText: 'OK' }
  })
  clockify.axios.defaults.adapter = adapter
  try {
    await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toMatchObject({
      createdCount: 1,
      deletedCount: 2,
      refreshFailed: false,
    })
    expect(adapter).toHaveBeenCalledOnce()
  } finally {
    clockify.axios.defaults.adapter = originalAdapter
  }
})

test('an interrupted delete resumes the saved replacement instead of creating another one', async () => {
  const fixture = await server()
  fixture.remove.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Connection lost')
  expect(await db.clockifyCollapses.count()).toBe(1)
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 1,
    deletedCount: 2,
    refreshFailed: false,
  })
  expect(fixture.create).toHaveBeenCalledOnce()
  expect([...fixture.entries.keys()]).toEqual(['replacement'])
})

test('resuming does not delete originals when the saved replacement has disappeared', async () => {
  const fixture = await server()
  fixture.remove.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Connection lost')
  await db.clockifyEntries.delete(['user', 'workspace', 'replacement'])
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('replacement is missing or changed')
  expect(fixture.create).toHaveBeenCalledOnce()
  expect(fixture.remove).toHaveBeenCalledOnce()
})

test('resuming does not discard edits made to an original after an interrupted collapse', async () => {
  const fixture = await server()
  fixture.remove.mockRejectedValueOnce(new Error('Connection lost'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Connection lost')
  await clockifyEntryCache.upsert(entry('a', '10:17', 120), scope)
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('original entries are missing or changed')
  expect(fixture.create).toHaveBeenCalledOnce()
  expect(fixture.remove).toHaveBeenCalledOnce()
})

test('matching concurrent calls share one collapse and cannot duplicate replacement entries', async () => {
  const fixture = await server()
  let finish!: () => void
  const pending = new Promise<void>(resolve => {
    finish = resolve
  })
  const create = fixture.create.getMockImplementation()!
  fixture.create.mockImplementationOnce(async (body, request) => {
    await pending
    return create(body, request)
  })
  const first = collapseClockifyMonthEntries(scope, 'UTC')
  const second = collapseClockifyMonthEntries({ workspaceId: scope.workspaceId, userId: scope.userId }, 'UTC')
  expect(second).toBe(first)
  await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledOnce())
  finish()
  await expect(first).resolves.toMatchObject({ createdCount: 1, deletedCount: 2 })
  expect(fixture.create).toHaveBeenCalledOnce()
})

test('disconnect after creating a replacement stops deletion and prevents an old-account resync', async () => {
  const fixture = await server()
  const create = fixture.create.getMockImplementation()!
  fixture.create.mockImplementationOnce(async (body, request) => {
    const result = await create(body, request)
    await clockifyEntryCache.clear()
    return result
  })
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('account changed')
  expect(fixture.remove).not.toHaveBeenCalled()
  expect(fixture.reads).not.toHaveBeenCalled()
  expect(await db.clockifyEntries.count()).toBe(0)
})

test('a lost create response is reconciled from the post-write sync before deleting originals', async () => {
  const fixture = await server()
  const create = fixture.create.getMockImplementation()!
  fixture.create.mockImplementationOnce(async (body, request) => {
    await create(body, request)
    throw new Error('Response lost')
  })
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Response lost')
  expect(fixture.remove).not.toHaveBeenCalled()
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 1,
    deletedCount: 2,
    refreshFailed: false,
  })
  expect(fixture.create).toHaveBeenCalledOnce()
})

test('an unconfirmed create is not blindly retried when no replacement can be identified', async () => {
  const fixture = await server()
  fixture.create.mockRejectedValueOnce(new Error('Timed out'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('Timed out')
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).rejects.toThrow('could not be confirmed')
  expect(fixture.create).toHaveBeenCalledOnce()
  expect(fixture.remove).not.toHaveBeenCalled()
})

test('a failed resync leaves cached entries unchanged and retry only finishes the resync', async () => {
  const fixture = await server()
  fixture.reads.mockRejectedValueOnce(new Error('Offline'))
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 1,
    deletedCount: 2,
    refreshFailed: true,
  })
  expect((await db.clockifyEntries.toArray()).map(row => row.id)).toEqual(['a', 'b'])
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 1,
    deletedCount: 2,
    refreshFailed: false,
  })
  expect(fixture.create).toHaveBeenCalledOnce()
  expect(fixture.remove).toHaveBeenCalledOnce()
  expect(await db.clockifyCollapses.count()).toBe(0)
})

test('ineligible cached entries cause no provider requests', async () => {
  const fixture = await server([
    entry('invoiced', '10:17', 5, { invoiced: true }),
    entry('unknown', '10:20', 5, { invoiced: undefined }),
  ])
  await expect(collapseClockifyMonthEntries(scope, 'UTC')).resolves.toEqual({
    createdCount: 0,
    deletedCount: 0,
    refreshFailed: false,
  })
  expect(fixture.create).not.toHaveBeenCalled()
  expect(fixture.remove).not.toHaveBeenCalled()
  expect(fixture.reads).not.toHaveBeenCalled()
})
