import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'

import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import * as auth from '../../../src/services/clockify/auth'
import * as clients from '../../../src/services/clockify/client'
import { clockify } from '../../../src/services/clockify/client'
import { clearSyncedClockifyTimeEntries } from '../../../src/services/clockify/sync'
import { createClockifyTimeEntry, stopClockifyTimeEntry } from '../../../src/services/clockify/time-entries'
import { DB, db } from '../../../src/services/db'
import { storage } from '../../../src/services/storage/config'
import { dismissTrackedTimer, startTrackedTimer, stopTrackedTimer } from '../../../src/services/tracking/coordinator'
import { describeTrackedTimer, retireEndedClockifyTimers } from '../../../src/services/tracking/store'

let running: TimeEntryWithRatesDtoV1 | null
const entries = new Map<string, TimeEntryWithRatesDtoV1>()
const draft = () => ({
  workspaceId: 'workspace',
  projectName: 'Project',
  callerId: 'worktree',
  source: 'quick_timer' as const,
  sourceId: 'same-task',
  body: { start: new Date().toISOString(), description: 'Original description', projectId: 'project', billable: true },
})

beforeEach(() => {
  running = null
  entries.clear()
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  vi.spyOn(auth, 'getTauriClockifyApiKey').mockResolvedValue({ apiKey: 'test-key' })
  vi.spyOn(clients, 'createClockifyClient').mockReturnValue(clockify)
  vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  vi.spyOn(storage, 'set').mockResolvedValue()
  vi.spyOn(clockify, 'getTimeEntries').mockImplementation(async () => (running ? [running] : []))
  vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async (body, options) => {
    if (!body.end && running) running.timeInterval!.end = body.start
    const entry = {
      id: String(entries.size + 1),
      userId: 'user',
      workspaceId: options.params.workspaceId,
      description: body.description,
      billable: body.billable,
      projectId: body.projectId,
      timeInterval: { start: body.start, end: body.end },
    }
    entries.set(entry.id, entry)
    if (!body.end) running = entry
    return entry
  })
  vi.spyOn(clockify, 'getTimeEntry').mockImplementation(async ({ params }) => {
    const entry = entries.get(params.id)
    if (!entry) throw new Error('Missing entry')
    return structuredClone(entry)
  })
  vi.spyOn(clockify, 'updateTimeEntry').mockImplementation(async (body, { params }) => {
    const entry = entries.get(params.id)!
    entry.timeInterval!.end = body.end
    if (running?.id === entry.id) running = null
    return structuredClone(entry)
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  queryClient.clear()
  await db.trackedTimers.clear()
  await clearSyncedClockifyTimeEntries()
})

test('six overlapping starts use one real timer despite identical task/caller and stale query data', async () => {
  queryClient.setQueryData(queryKeys.clockify.runningEntry(), [])
  const timers = await Promise.all(Array.from({ length: 6 }, () => startTrackedTimer(draft())))
  expect(timers.map(timer => timer.mode)).toEqual(['clockify', ...Array(5).fill('internal')])
  expect(new Set(timers.map(timer => timer.timerId)).size).toBe(6)
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
  expect(clockify.getTimeEntries).toHaveBeenCalledTimes(6)
  expect(await db.trackedTimers.count()).toBe(6)
})

test('stop order 2, 1, 3 preserves internal mode, saved context, and the real timer', async () => {
  const [a, b, c] = await Promise.all([
    startTrackedTimer(draft()),
    startTrackedTimer(draft()),
    startTrackedTimer(draft()),
  ])
  await stopTrackedTimer(b.timerId)
  expect(running?.id).toBe(a.entryId)
  await stopTrackedTimer(a.timerId)
  expect(running).toBeNull()
  await stopTrackedTimer(c.timerId)
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(3)
  const bodies = vi.mocked(clockify.createTimeEntry).mock.calls.map(call => call[0])
  expect(bodies.slice(1)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'Original description',
        projectId: 'project',
        billable: true,
        start: b.startedAt,
        end: expect.any(String),
      }),
      expect.objectContaining({ start: c.startedAt, end: expect.any(String) }),
    ]),
  )
  expect(await db.trackedTimers.count()).toBe(0)
  await expect(stopTrackedTimer(c.timerId)).rejects.toThrow('no longer active')
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(3)
})

test('concurrent stops share a save, retain the first end, and never automatically repeat an uncertain POST', async () => {
  await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  let fail!: (error: Error) => void
  vi.mocked(clockify.createTimeEntry).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject
      }),
  )
  const first = stopTrackedTimer(internal.timerId)
  const second = stopTrackedTimer(internal.timerId)
  expect(second).toBe(first)
  const rejected = expect(first).rejects.toThrow('unconfirmed')
  await vi.waitFor(() => expect(fail).toBeDefined())
  const frozen = (await db.trackedTimers.get(internal.timerId))!.endedAt
  fail(new Error('Lost response'))
  await rejected
  expect(await db.trackedTimers.get(internal.timerId)).toMatchObject({
    state: 'failed',
    uncertain: true,
    endedAt: frozen,
  })
  await expect(stopTrackedTimer(internal.timerId)).rejects.toThrow('unconfirmed')
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(2)
  const timer = (await db.trackedTimers.get(internal.timerId))!
  expect(describeTrackedTimer(timer, Date.now() + 60_000).elapsedSeconds).toBe(
    describeTrackedTimer(timer).elapsedSeconds,
  )
})

test('stops persist their pending interval before credentials load and retry definite failures with the same end', async () => {
  await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  let fail!: (error: Error) => void
  vi.mocked(auth.getTauriClockifyApiKey).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject
      }),
  )
  const stopped = stopTrackedTimer(internal.timerId)
  const rejected = expect(stopped).rejects.toThrow('Credentials unavailable')
  await vi.waitFor(() => expect(fail).toBeDefined())
  const pending = (await db.trackedTimers.get(internal.timerId))!
  expect(pending).toMatchObject({ state: 'saving', endedAt: expect.any(String), uncertain: false })
  fail(new Error('Credentials unavailable'))
  await rejected
  expect(await db.trackedTimers.get(internal.timerId)).toMatchObject({
    state: 'failed',
    endedAt: pending.endedAt,
    uncertain: false,
  })
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
  const result = await stopTrackedTimer(internal.timerId)
  expect(result).toMatchObject({ mode: 'internal', timeInterval: { end: pending.endedAt } })
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(2)
})

test('a sequential UI start replaces only the real timer; an agent stop never touches the replacement', async () => {
  const real = await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  const replacement = await createClockifyTimeEntry(
    { start: new Date().toISOString(), description: 'Manual work' },
    'workspace',
  )
  expect(running?.id).toBe(replacement.id)
  expect((await db.trackedTimers.get(internal.timerId))?.endedAt).toBeNull()
  const stopped = await stopTrackedTimer(real.timerId)
  expect(stopped).toMatchObject({ id: real.entryId, timeInterval: { end: replacement.timeInterval?.start } })
  expect(running?.id).toBe(replacement.id)
  expect(clockify.updateTimeEntry).not.toHaveBeenCalled()
  expect(await db.trackedTimers.get(real.timerId)).toBeUndefined()
})

test('a stale empty running list right after a start keeps the timer stoppable and the next start internal', async () => {
  const first = await startTrackedTimer(draft())
  vi.mocked(clockify.getTimeEntries).mockResolvedValue([]) // Clockify's list lags behind the new entry.
  const second = await startTrackedTimer(draft())
  expect(second.mode).toBe('internal')
  expect(running?.id).toBe(first.entryId)
  expect(await stopTrackedTimer(first.timerId)).toMatchObject({ id: first.entryId, mode: 'clockify' })
  expect(running).toBeNull()
})

test('UI and MCP starts share the critical section, while UI starts always remain real', async () => {
  let release!: () => void
  vi.mocked(clockify.getTimeEntries).mockImplementationOnce(async () => {
    await new Promise<void>(resolve => {
      release = resolve
    })
    return []
  })
  const agent = startTrackedTimer(draft())
  await vi.waitFor(() => expect(release).toBeDefined())
  const ui = createClockifyTimeEntry({ start: new Date().toISOString(), description: 'Manual' }, 'workspace')
  expect(clockify.createTimeEntry).not.toHaveBeenCalled()
  release()
  const [first, second] = await Promise.all([agent, ui])
  expect(first.mode).toBe('clockify')
  expect(running?.id).toBe(second.id)
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(2)
})

test('a UI stop retires the Clockify reference so a late agent stop cannot resurrect a deleted entry', async () => {
  const real = await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  await stopClockifyTimeEntry(entries.get(real.entryId!)!)
  entries.delete(real.entryId!)
  const reads = vi.mocked(clockify.getTimeEntry).mock.calls.length
  await expect(stopTrackedTimer(real.timerId)).rejects.toThrow('no longer active')
  expect(clockify.getTimeEntry).toHaveBeenCalledTimes(reads)
  expect(await db.trackedTimers.get(real.timerId)).toBeUndefined()
  expect((await db.trackedTimers.get(internal.timerId))?.state).toBe('active')
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
})

test.each([400, undefined])('a failed Clockify lookup (%s) leaves its reference unchanged', async status => {
  const real = await startTrackedTimer(draft())
  const original = await db.trackedTimers.get(real.timerId)
  const error = new AxiosError('Entry lookup failed')
  if (status)
    error.response = {
      status,
      data: {},
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
    }
  vi.mocked(clockify.getTimeEntry).mockRejectedValueOnce(error)
  await expect(stopTrackedTimer(real.timerId)).rejects.toBe(error)
  expect(await db.trackedTimers.get(real.timerId)).toEqual(original)
  expect(clockify.updateTimeEntry).not.toHaveBeenCalled()
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
})

test('a failed Clockify stop does not freeze local time; a retry reads the confirmed remote interval', async () => {
  const real = await startTrackedTimer(draft())
  const original = await db.trackedTimers.get(real.timerId)
  vi.mocked(clockify.updateTimeEntry).mockImplementationOnce(async body => {
    entries.get(real.entryId!)!.timeInterval!.end = body.end
    throw new Error('Response lost')
  })
  await expect(stopTrackedTimer(real.timerId)).rejects.toThrow('Response lost')
  expect(await db.trackedTimers.get(real.timerId)).toEqual(original)
  const result = await stopTrackedTimer(real.timerId)
  expect(result.timeInterval?.end).toBe(entries.get(real.entryId!)!.timeInterval!.end)
  expect(clockify.updateTimeEntry).toHaveBeenCalledTimes(1)
  expect(await db.trackedTimers.get(real.timerId)).toBeUndefined()
})

test('retirement removes only references Clockify confirms ended, never mere absence from the running list', async () => {
  const real = await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  const startedAt = new Date(Date.now() - 120_000).toISOString()
  const record = { ...(await db.trackedTimers.get(real.timerId))!, startedAt }
  entries.set('ended-entry', { ...running!, id: 'ended-entry', timeInterval: { start: startedAt, end: startedAt } })
  await db.trackedTimers.bulkPut([
    record,
    { ...record, timerId: 'ended', entryId: 'ended-entry' },
    { ...record, timerId: 'deleted', entryId: 'deleted-entry' },
    { ...record, timerId: 'rejected', entryId: 'rejected-entry' },
    { ...record, timerId: 'unconfirmed', entryId: null, state: 'failed', uncertain: true },
    { ...record, timerId: 'other-workspace', workspaceId: 'other-workspace', entryId: 'ended-entry' },
    { ...record, timerId: 'other-user', userId: 'other-user', entryId: 'ended-entry' },
  ])
  const missing = (status: number) =>
    new AxiosError('Missing', String(status), undefined, undefined, {
      status,
      data: {},
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })
  vi.mocked(clockify.getTimeEntry).mockImplementation(async ({ params }) => {
    const entry = entries.get(params.id)
    if (!entry) throw missing(params.id === 'rejected-entry' ? 400 : 404)
    return structuredClone(entry)
  })
  await retireEndedClockifyTimers(clockify, { userId: 'user', workspaceId: 'workspace' }, []) // The list omits a running entry.
  expect((await db.trackedTimers.toArray()).map(timer => timer.timerId).sort()).toEqual(
    [real.timerId, internal.timerId, 'other-workspace', 'other-user'].sort(),
  )
})

test('dismiss only removes failed internal time and cannot race a pending retry', async () => {
  const real = await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  await expect(dismissTrackedTimer(real.timerId)).rejects.toThrow('Only failed internal')
  await expect(dismissTrackedTimer(internal.timerId)).rejects.toThrow('Only failed internal')
  await db.trackedTimers.update(internal.timerId, { state: 'failed', endedAt: new Date().toISOString() })
  let fail!: (error: Error) => void
  vi.mocked(auth.getTauriClockifyApiKey).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject
      }),
  )
  const retry = stopTrackedTimer(internal.timerId)
  const rejected = expect(retry).rejects.toThrow('Offline')
  await expect(dismissTrackedTimer(internal.timerId)).rejects.toThrow('finish saving')
  await vi.waitFor(() => expect(fail).toBeDefined())
  fail(new Error('Offline'))
  await rejected
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'other-user' })
  await expect(dismissTrackedTimer(internal.timerId)).rejects.toThrow('original Clockify account')
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  await dismissTrackedTimer(internal.timerId)
  expect(await db.trackedTimers.get(internal.timerId)).toBeUndefined()
  expect(await db.trackedTimers.get(real.timerId)).toBeDefined()
  await expect(stopTrackedTimer(internal.timerId)).rejects.toThrow('no longer active')
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
  expect(clockify.updateTimeEntry).not.toHaveBeenCalled()
})

test('internal timers survive another database connection and cannot save under another account', async () => {
  await startTrackedTimer(draft())
  const internal = await startTrackedTimer(draft())
  const reopened = new DB(db.name)
  try {
    expect(await reopened.trackedTimers.get(internal.timerId)).toMatchObject({
      startedAt: internal.startedAt,
      mode: 'internal',
      callerId: 'worktree',
    })
  } finally {
    reopened.close()
  }
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'other-user' })
  await expect(stopTrackedTimer(internal.timerId)).rejects.toThrow('original Clockify account')
  expect(clockify.createTimeEntry).toHaveBeenCalledTimes(1)
})

test('expired queued starts never create a timer or send a provider request', async () => {
  await expect(startTrackedTimer(draft(), Date.now() - 1)).rejects.toThrow('expired')
  expect(clockify.getTimeEntries).not.toHaveBeenCalled()
  expect(clockify.createTimeEntry).not.toHaveBeenCalled()
  expect(await db.trackedTimers.count()).toBe(0)
})
