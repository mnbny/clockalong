import type { TimeEntryDtoV1 } from '../../../src/services/clockify/generated/clockify'
import type { AxiosAdapter } from 'axios'

import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, expect, test, vi } from 'vitest'

import { clockify } from '../../../src/services/clockify/client'
import {
  fixClockifyTimeEntryOverlaps,
  getCompletedClockifyTimeEntryOverlapFixes,
} from '../../../src/services/clockify/overlaps'

vi.mock('../../../src/services/clockify/auth', () => ({
  getTauriClockifyApiKey: async () => ({ apiKey: 'test-key' }),
}))

const now = new Date('2026-10-16T12:00:00Z')

function overlappingEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `entry-${index}`,
    userId: 'user',
    workspaceId: 'workspace',
    description: 'Task [ref:linear:workspace:TASK-1]',
    billable: true,
    projectId: 'project',
    taskId: 'task',
    tagIds: ['tag'],
    type: 'REGULAR' as const,
    timeInterval: { start: now.toISOString(), end: new Date(now.getTime() + 60_000).toISOString() },
  }))
}

function updatedEntries(body: Parameters<typeof clockify.replaceMany>[0]): TimeEntryDtoV1[] {
  return body.map(entry => ({
    ...entry,
    billable: entry.billable ?? false,
    customFieldValues: [],
    description: entry.description ?? '',
    isLocked: false,
    kioskId: '',
    projectId: entry.projectId ?? '',
    tagIds: [...(entry.tagIds ?? [])],
    taskId: entry.taskId ?? '',
    timeInterval: { start: entry.start, end: entry.end },
    type: entry.type ?? 'REGULAR',
    userId: 'user',
    workspaceId: 'workspace',
  }))
}

function apiError(status: number, retryAfter?: string) {
  return new AxiosError('Clockify request failed', undefined, undefined, undefined, {
    config: { headers: new AxiosHeaders() },
    data: {},
    headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
    status,
    statusText: '',
  })
}

test('100 overlap repairs use four bulk requests and preserve entry context and duration', async () => {
  const update = vi.spyOn(clockify, 'replaceMany').mockImplementation(async body => updatedEntries(body))
  const singleUpdate = vi.spyOn(clockify, 'updateTimeEntry')
  const entries = overlappingEntries(101)
  const fixes = getCompletedClockifyTimeEntryOverlapFixes(entries)

  await expect(fixClockifyTimeEntryOverlaps(fixes)).resolves.toBe(100)
  expect(update).toHaveBeenCalledTimes(4)
  expect(singleUpdate).not.toHaveBeenCalled()
  for (const [body, options] of update.mock.calls) {
    expect(options?.params).toStrictEqual({ userId: 'user', workspaceId: 'workspace' })
    expect(body).toHaveLength(25)
  }
  for (const [index, body] of update.mock.calls.flatMap(([body]) => body).entries()) {
    expect(body).toStrictEqual({
      id: `entry-${index + 1}`,
      billable: true,
      description: entries[0].description,
      projectId: 'project',
      taskId: 'task',
      tagIds: ['tag'],
      type: 'REGULAR',
      start: new Date(now.getTime() + (index + 1) * 60_000).toISOString(),
      end: new Date(now.getTime() + (index + 2) * 60_000).toISOString(),
    })
  }
})

test('larger repairs use sequential batches of at most 25 entries', async () => {
  vi.useFakeTimers()
  let active = 0
  let maxActive = 0
  const update = vi.spyOn(clockify, 'replaceMany').mockImplementation(async body => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active -= 1
    return updatedEntries(body)
  })
  const result = fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(64)))
  await vi.runAllTimersAsync()

  await expect(result).resolves.toBe(63)
  expect(maxActive).toBe(1)
  expect(update.mock.calls.map(([body]) => body.length)).toStrictEqual([25, 25, 13])
  expect(new Set(update.mock.calls.flatMap(([body]) => body.map(entry => entry.id))).size).toBe(63)
})

test.each([
  [undefined, 1000],
  ['invalid', 1000],
  ['2', 2000],
  [new Date(now.getTime() + 2000).toUTCString(), 2000],
])('a 429 waits for %s and retries only the rejected batch', async (retryAfter, delay) => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const update = vi
    .spyOn(clockify, 'replaceMany')
    .mockImplementation(async body => updatedEntries(body))
    .mockImplementationOnce(async body => updatedEntries(body))
    .mockRejectedValueOnce(apiError(429, retryAfter))
  const result = fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(76)))

  await vi.advanceTimersByTimeAsync(delay - 1)
  expect(update).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe(75)
  expect(update.mock.calls.map(([body]) => body[0].id)).toStrictEqual(['entry-1', 'entry-26', 'entry-26', 'entry-51'])
  expect(update.mock.calls[2]).toStrictEqual(update.mock.calls[1])
})

test('persistent rate limits back off three times then stop the remaining batches', async () => {
  vi.useFakeTimers()
  const update = vi.spyOn(clockify, 'replaceMany').mockRejectedValue(apiError(429))
  const result = expect(
    fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(51))),
  ).rejects.toThrow('Clockify is limiting requests')

  for (const delay of [1000, 2000, 4000]) {
    const previousCount = update.mock.calls.length
    await vi.advanceTimersByTimeAsync(delay - 1)
    expect(update).toHaveBeenCalledTimes(previousCount)
    await vi.advanceTimersByTimeAsync(1)
    expect(update).toHaveBeenCalledTimes(previousCount + 1)
  }
  await result
  expect(update.mock.calls.every(([body]) => body[0].id === 'entry-1')).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

test.each([400, 403, 500])('a %s stops after partial success without replaying writes', async status => {
  const error = apiError(status)
  const update = vi
    .spyOn(clockify, 'replaceMany')
    .mockImplementationOnce(async body => updatedEntries(body))
    .mockRejectedValue(error)
  await expect(
    fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(76))),
  ).rejects.toBe(error)
  expect(update.mock.calls.map(([body]) => body[0].id)).toStrictEqual(['entry-1', 'entry-26'])
})

test('a long Retry-After stops instead of retrying before the server permits it', async () => {
  vi.useFakeTimers()
  const update = vi.spyOn(clockify, 'replaceMany').mockRejectedValue(apiError(429, '3600'))
  await expect(
    fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(2))),
  ).rejects.toThrow('Clockify is limiting requests')
  expect(update).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('an incomplete bulk response stops before the next batch without reporting success', async () => {
  const update = vi.spyOn(clockify, 'replaceMany').mockImplementation(async body => updatedEntries(body.slice(0, -1)))
  await expect(
    fixClockifyTimeEntryOverlaps(getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(51))),
  ).rejects.toThrow('Clockify did not confirm every update')
  expect(update).toHaveBeenCalledTimes(1)
})

test.each(['id', 'userId', 'workspaceId'] as const)('invalid %s cannot reach a bulk write', async key => {
  const update = vi.spyOn(clockify, 'replaceMany')
  const fixes = getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(102))
  fixes[100].entry[key] = key === 'id' ? '' : 'other'
  await expect(fixClockifyTimeEntryOverlaps(fixes)).rejects.toThrow('same user and workspace')
  expect(update).not.toHaveBeenCalled()
})

test('the generated bulk client serializes updates and logs only the request count', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  const originalAdapter = clockify.axios.defaults.adapter
  const adapter = vi.fn<AxiosAdapter>(async config => {
    const body = JSON.parse(config.data)
    return { config, data: updatedEntries(body), headers: {}, status: 200, statusText: 'OK' }
  })
  clockify.axios.defaults.adapter = adapter
  try {
    const fixes = getCompletedClockifyTimeEntryOverlapFixes(overlappingEntries(3))
    await expect(fixClockifyTimeEntryOverlaps(fixes)).resolves.toBe(2)
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter.mock.calls[0][0].url).toBe('/v1/workspaces/workspace/user/user/time-entries')
    expect(JSON.parse(adapter.mock.calls[0][0].data)).toHaveLength(2)
    const requestLog = log.mock.calls.find(([message]) => message === '[clockify api] request')
    expect(requestLog?.[1].data).toStrictEqual({ count: 2, type: 'array' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('test-key')
  } finally {
    clockify.axios.defaults.adapter = originalAdapter
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
