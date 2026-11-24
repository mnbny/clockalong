import type { McpCommandPayload } from '../../../src/services/tauri/mcp-client'

import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import * as clockifyAuth from '../../../src/services/clockify/auth'
import * as clockifyClient from '../../../src/services/clockify/client'
import { clockify } from '../../../src/services/clockify/client'
import * as collapseEntries from '../../../src/services/clockify/collapse-entries'
import * as overlapRepair from '../../../src/services/clockify/overlap-repair'
import { clearSyncedClockifyTimeEntries } from '../../../src/services/clockify/sync'
import { db } from '../../../src/services/db'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { executeMcpCommand, type ExecuteMcpCommandContext } from '../../../src/services/mcp/commands'
import { storage } from '../../../src/services/storage/config'

const context = {
  clockifyConnected: true,
  githubConnected: true,
  linearConnected: false,
  clockifyTimerProject: {
    projectId: 'project',
    projectName: 'Project',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
  },
  linearViewerId: null,
  runningEntry: { id: 'running-entry', timeInterval: { start: '2026-10-12T20:00:00Z' } },
} satisfies ExecuteMcpCommandContext

test('overlap repair uses the active workspace and profile timezone without requiring a timer project', async () => {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, {
    id: 'user',
    activeWorkspace: 'active-workspace',
    settings: { timeZone: 'America/Los_Angeles' },
  })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }, { id: 'active-workspace' }])
  const repair = vi.spyOn(overlapRepair, 'fixClockifyMonthOverlaps').mockResolvedValue({
    updatedCount: 4,
    refreshFailed: true,
  })
  const command = { tool: 'fix_overlaps', requestId: 'repair', arguments: {} } as const
  for (const clockifyTimerProject of [context.clockifyTimerProject, null]) {
    expect(await executeMcpCommand(command, { ...context, clockifyTimerProject, runningEntry: null })).toEqual({
      ok: true,
      result: { updatedCount: 4, refreshFailed: true },
    })
  }
  expect(repair).toHaveBeenCalledTimes(2)
  for (const args of repair.mock.calls) {
    expect(args).toEqual([{ userId: 'user', workspaceId: 'active-workspace' }, 'America/Los_Angeles'])
  }
})

test('overlap repair rejects unavailable accounts and propagates repair failures', async () => {
  const repair = vi.spyOn(overlapRepair, 'fixClockifyMonthOverlaps')
  const command = { tool: 'fix_overlaps', requestId: 'repair', arguments: {} } as const
  expect(await executeMcpCommand(command, { ...context, clockifyConnected: false })).toMatchObject({
    ok: false,
    error: { code: 'clockify_disconnected' },
  })
  expect((await executeMcpCommand(command, context)).ok).toBe(false)
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  expect((await executeMcpCommand(command, context)).ok).toBe(false)
  expect(repair).not.toHaveBeenCalled()

  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  repair.mockRejectedValue(new Error('Clockify is limiting requests.'))
  expect(await executeMcpCommand(command, context)).toEqual({
    ok: false,
    error: { code: 'clockify_error', message: 'Clockify is limiting requests.' },
  })
})

test('MCP collapse uses the shared operation, active workspace and timezone without a selected timer project', async () => {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, {
    id: 'user',
    activeWorkspace: 'active-workspace',
    settings: { timeZone: 'America/Los_Angeles' },
  })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }, { id: 'active-workspace' }])
  const collapse = vi.spyOn(collapseEntries, 'collapseClockifyMonthEntries').mockResolvedValue({
    createdCount: 2,
    deletedCount: 8,
    refreshFailed: false,
  })
  const command = { tool: 'collapse_entries', requestId: 'collapse', arguments: {} } as const
  expect(await executeMcpCommand(command, { ...context, clockifyTimerProject: null })).toEqual({
    ok: true,
    result: { createdCount: 2, deletedCount: 8, refreshFailed: false },
  })
  expect(collapse).toHaveBeenCalledExactlyOnceWith(
    { userId: 'user', workspaceId: 'active-workspace' },
    'America/Los_Angeles',
  )
  collapse.mockRejectedValue(new Error('Delete failed'))
  expect(await executeMcpCommand(command, context)).toEqual({
    ok: false,
    error: { code: 'clockify_error', message: 'Delete failed' },
  })
})

test('adding Quick Timer time preserves the running association and resolves template values', async () => {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  vi.spyOn(storage, 'get').mockImplementation(async (key: keyof typeof storage.config) => {
    if (key === 'quickTimers')
      return [{ id: 'preset', name: 'Meeting', icon: '', descriptionTemplate: '{name}: {topic}' }]
    if (key === 'quickTimersCache') return [{ id: 'preset', values: { name: 'Alex', topic: 'Old topic' } }]
    return storage.config[key].default
  })
  const set = vi.spyOn(storage, 'set').mockImplementation(async () => {})
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {})
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async body => ({
    id: 'new-entry',
    billable: body.billable,
    description: body.description,
    timeInterval: { start: body.start, end: body.end },
  }))
  const stop = vi.spyOn(clockify, 'stopRunningTimeEntry').mockImplementation(async () => {
    throw new Error('Must not stop')
  })
  const result = await executeMcpCommand(
    {
      tool: 'add_time_entry',
      requestId: 'add',
      arguments: {
        source: 'quick_timer',
        id: 'preset',
        durationMinutes: 1.5,
        endedAt: '2026-10-12T14:00:00-07:00',
        variables: { topic: 'Planning' },
      },
    },
    context,
  )

  expect(result).toStrictEqual({
    ok: true,
    result: {
      billable: true,
      description: 'Alex: Planning',
      durationSeconds: 90,
      entryId: 'new-entry',
      startedAt: '2026-10-12T20:58:30.000Z',
      endedAt: '2026-10-12T21:00:00.000Z',
      projectName: 'Project',
    },
  })
  expect(create).toHaveBeenCalledTimes(1)
  expect((await db.clockifyEntries.get(['user', 'workspace', 'new-entry']))?.entry.description).toBe('Alex: Planning')
  expect(create.mock.calls[0][0]?.projectId).toBe('project')
  expect(set.mock.calls.some(call => call[0] === 'quickTimersCache')).toBe(true)
  expect(set.mock.calls.some(call => call[0] === 'quickTimersActiveEntry')).toBe(false)
  expect(stop).toHaveBeenCalledTimes(0)

  const started = await executeMcpCommand(
    { tool: 'start_timer', requestId: 'start', arguments: { source: 'quick_timer', id: 'preset' } },
    context,
  )
  expect(started.ok).toBe(true)
  expect('end' in create.mock.calls[1][0]!).toBe(false)
  expect(set.mock.calls.some(call => call[0] === 'quickTimersActiveEntry')).toBe(true)
})

test('invalid duration, missing project, disconnected Clockify, and unknown work cannot create time', async () => {
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async () => {
    throw new Error('Must not create')
  })
  vi.spyOn(storage, 'get').mockImplementation(async (key: keyof typeof storage.config) => storage.config[key].default)
  const command = {
    tool: 'add_time_entry',
    requestId: 'test',
    arguments: { source: 'quick_timer', id: 'unknown', durationMinutes: 1 },
  } satisfies McpCommandPayload
  for (const durationMinutes of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    expect(
      (await executeMcpCommand({ ...command, arguments: { ...command.arguments, durationMinutes } }, context)).ok,
    ).toBe(false)
  }
  expect(
    (await executeMcpCommand({ ...command, arguments: { ...command.arguments, endedAt: 'invalid' } }, context)).ok,
  ).toBe(false)
  expect(await executeMcpCommand(command, { ...context, clockifyTimerProject: null })).toStrictEqual({
    ok: false,
    error: {
      code: 'missing_project',
      message: 'No Clockify project is selected. Choose a default project in Clockalong settings.',
    },
  })
  const disconnected = await executeMcpCommand(command, { ...context, clockifyConnected: false })
  expect(disconnected.ok).toBe(false)
  const unknown = await executeMcpCommand(command, context)
  expect(unknown.ok).toBe(false)
  if (!unknown.ok) expect(unknown.error.code).toBe('unknown_target')
  expect(create).toHaveBeenCalledTimes(0)
})

test('GitHub commands resolve cached IDs and reject missing IDs without creating time', async () => {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  const item = {
    id: 'owner/repo:issue:7',
    type: 'issue' as const,
    number: 7,
    title: 'Fix issue',
    url: 'https://github.com/owner/repo/issues/7',
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://github.com/owner/repo',
    author: null,
    authorAvatarUrl: null,
    state: 'open',
    updatedAt: '2026-01-01',
    syncedAt: '2026-01-01',
    item: { labels: [] },
  }
  await githubWorkItemCache.replace([item], githubWorkItemCache.beginSync(), {
    repositories: ['owner/repo'],
    visibleWorkItemTypes: { issues: true, pullRequests: true },
  })
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'githubSelectedRepositories'
      ? [
          {
            fullName: 'owner/repo',
            id: 1,
            name: 'repo',
            owner: 'owner',
            private: false,
            url: 'https://github.com/owner/repo',
          },
        ]
      : storage.config[key].default,
  )
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {})
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async body => ({
    id: 'new-entry',
    billable: body.billable,
    description: body.description,
    timeInterval: { start: body.start },
  }))
  try {
    const missing = await executeMcpCommand(
      { tool: 'start_timer', requestId: 'missing', arguments: { source: 'github', id: 'missing' } },
      context,
    )
    expect(missing).toMatchObject({ ok: false, error: { code: 'unknown_target' } })
    expect(create).not.toHaveBeenCalled()
    const disconnected = await executeMcpCommand(
      { tool: 'start_timer', requestId: 'disconnected', arguments: { source: 'github', id: item.id } },
      { ...context, githubConnected: false },
    )
    expect(disconnected).toMatchObject({ ok: false, error: { code: 'unknown_target' } })
    vi.mocked(storage.get)
      .mockImplementationOnce(async () => true)
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => ({ issues: true, pullRequests: true }))
    const excluded = await executeMcpCommand(
      { tool: 'start_timer', requestId: 'excluded', arguments: { source: 'github', id: item.id } },
      context,
    )
    expect(excluded).toMatchObject({ ok: false, error: { code: 'unknown_target' } })
    expect(create).not.toHaveBeenCalled()
    const found = await executeMcpCommand(
      { tool: 'start_timer', requestId: 'found', arguments: { source: 'github', id: item.id } },
      context,
    )
    expect(found).toMatchObject({
      ok: true,
      result: { description: expect.stringContaining('ref:github:owner/repo:issue:7') },
    })
    expect(create).toHaveBeenCalledOnce()
  } finally {
    await githubWorkItemCache.clear()
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  queryClient.clear()
  await db.trackedTimers.clear()
  await clearSyncedClockifyTimeEntries()
})

test('stopping through MCP caches a partial response immediately', async () => {
  await seedRealTimer()
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {})
  vi.spyOn(storage, 'set').mockImplementation(async () => {})
  vi.spyOn(clockify, 'updateTimeEntry').mockResolvedValue({ timeInterval: { end: '2026-01-01T11:00:00Z' } })
  const result = await executeMcpCommand(
    { tool: 'stop_timer', requestId: 'stop', arguments: { timerId: 'tracked' } },
    {
      ...context,
      runningEntry: {
        id: 'timer',
        userId: 'user',
        workspaceId: 'workspace',
        description: 'Tracked',
        timeInterval: { start: '2026-01-01T10:00:00Z' },
      },
    },
  )
  expect(result.ok).toBe(true)
  expect((await db.clockifyEntries.get(['user', 'workspace', 'timer']))?.entry).toMatchObject({
    description: 'Tracked',
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  })
})

test('stop_timer recovers without the original timerId and never guesses between running timers', async () => {
  await seedRealTimer()
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {})
  vi.spyOn(storage, 'set').mockImplementation(async () => {})
  const stopped = new Set<string>()
  const remote = (id: string) => ({
    id,
    userId: 'user',
    workspaceId: 'workspace',
    description: id,
    timeInterval: { start: '2026-01-01T10:00:00Z' },
  })
  vi.mocked(clockify.getTimeEntry).mockImplementation(async ({ params }) => {
    if (params.id === 'missing') throw new AxiosError('Not found', '404', undefined, undefined, notFound)
    return remote(params.id)
  })
  const update = vi.spyOn(clockify, 'updateTimeEntry').mockImplementation(async (body, { params }) => {
    stopped.add(params.id)
    return { ...remote(params.id), timeInterval: { start: body.start, end: body.end } }
  })
  vi.mocked(clockify.getTimeEntries).mockImplementation(async () => (stopped.has('manual') ? [] : [remote('manual')]))
  const stop = (arguments_: Record<string, string>) =>
    executeMcpCommand({ tool: 'stop_timer', requestId: 'stop', arguments: arguments_ }, context)

  expect(await stop({})).toMatchObject({
    ok: false,
    error: { message: expect.stringMatching(/Several timers.*"timerId":"tracked".*"entryId":"manual"/) },
  })
  expect(update).not.toHaveBeenCalled()
  expect(await stop({ entryId: 'manual' })).toMatchObject({ ok: true, result: { timerId: null, entryId: 'manual' } })
  expect(await stop({})).toMatchObject({ ok: true, result: { timerId: 'tracked', entryId: 'timer' } })
  expect(await stop({})).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining('No timer is running') },
  })
  update.mockRejectedValueOnce(new AxiosError('Rejected', '400', undefined, undefined, { ...notFound, status: 400 }))
  expect(await stop({ entryId: 'other' })).toMatchObject({ ok: false, error: { message: 'Rejected' } })
  expect(await stop({ timerId: 'missing' })).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining('get_tracking_status') },
  })
  await seedRealTimer() // An entry ID passed as timerId still finds the timer that owns it.
  expect(await stop({ timerId: 'timer' })).toMatchObject({ ok: true, result: { timerId: 'tracked', entryId: 'timer' } })
  await seedRealTimer() // Both IDs may name one timer; IDs of different timers stop nothing.
  expect(await stop({ timerId: 'tracked', entryId: 'manual' })).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining('different timers') },
  })
  expect(await stop({ timerId: 'tracked', entryId: 'timer' })).toMatchObject({
    ok: true,
    result: { timerId: 'tracked' },
  })
})

test('an internal save failure returns an MCP error and retains the unsaved interval', async () => {
  await seedRealTimer()
  await db.trackedTimers.update('tracked', { mode: 'internal', entryId: null })
  const create = vi.spyOn(clockify, 'createTimeEntry').mockRejectedValue(new Error('Connection lost'))
  const result = await executeMcpCommand(
    { tool: 'stop_timer', requestId: 'failed-save', arguments: { timerId: 'tracked' } },
    context,
  )
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'clockify_error', message: expect.stringContaining('unconfirmed') },
  })
  expect(await db.trackedTimers.get('tracked')).toMatchObject({
    mode: 'internal',
    state: 'failed',
    endedAt: expect.any(String),
    uncertain: true,
  })
  expect(create).toHaveBeenCalledTimes(1)
  expect(clockify.getTimeEntry).not.toHaveBeenCalled()
})

test('a timer response received after disconnect cannot repopulate the local cache', async () => {
  await seedRealTimer()
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {})
  vi.spyOn(storage, 'set').mockImplementation(async () => {})
  let finish!: (value: { timeInterval: { end: string } }) => void
  const stop = vi.spyOn(clockify, 'updateTimeEntry').mockReturnValue(
    new Promise(resolve => {
      finish = resolve
    }),
  )
  const pending = executeMcpCommand(
    { tool: 'stop_timer', requestId: 'late-stop', arguments: { timerId: 'tracked' } },
    {
      ...context,
      runningEntry: {
        id: 'timer',
        userId: 'user',
        workspaceId: 'workspace',
        timeInterval: { start: '2026-01-01T10:00:00Z' },
      },
    },
  )
  await vi.waitFor(() => expect(stop).toHaveBeenCalled())
  await clearSyncedClockifyTimeEntries()
  finish({ timeInterval: { end: '2026-01-01T11:00:00Z' } })
  expect((await pending).ok).toBe(true)
  expect(await db.clockifyEntries.count()).toBe(0)
})

beforeEach(() => {
  vi.spyOn(clockifyAuth, 'getTauriClockifyApiKey').mockResolvedValue({ apiKey: 'test-key' })
  vi.spyOn(clockifyClient, 'createClockifyClient').mockReturnValue(clockify)
  vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([])
})

const notFound = { status: 404, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } }

async function seedRealTimer() {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  const entry = {
    id: 'timer',
    userId: 'user',
    workspaceId: 'workspace',
    description: 'Tracked',
    timeInterval: { start: '2026-01-01T10:00:00Z' },
  }
  vi.spyOn(clockify, 'getTimeEntry').mockResolvedValue(entry)
  await db.trackedTimers.put({
    timerId: 'tracked',
    userId: 'user',
    workspaceId: 'workspace',
    projectName: 'Project',
    callerId: null,
    source: 'quick_timer',
    sourceId: 'preset',
    mode: 'clockify',
    body: { start: entry.timeInterval.start, description: 'Tracked' },
    entryId: 'timer',
    startedAt: entry.timeInterval.start,
    endedAt: null,
    state: 'active',
    uncertain: false,
    error: null,
  })
}
