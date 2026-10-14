import { afterEach, expect, test, vi } from 'vitest'

import { clockify } from '../../../src/services/clockify/client'
import { createClockifyTimeEntryFromEntry } from '../../../src/services/clockify/time-entries'
import {
  getClockifyTimeEntryIntervalFromMinutes,
  getClockifyTimeEntryTiming,
} from '../../../src/services/clockify/time-entry-interval'

test('manual minutes preserve fractional minutes and cross midnight', () => {
  const interval = getClockifyTimeEntryIntervalFromMinutes(1.5, new Date('2026-10-12T00:01:00Z'))
  expect(interval).toStrictEqual({ start: '2026-10-11T23:59:30.000Z', end: '2026-10-12T00:01:00.000Z' })
  expect(getClockifyTimeEntryTiming(interval)).toStrictEqual(interval)
  expect('end' in getClockifyTimeEntryTiming()).toBe(false)
})

test('invalid durations and incomplete or reversed intervals cannot create timers', () => {
  for (const minutes of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    expect(() => getClockifyTimeEntryIntervalFromMinutes(minutes)).toThrow()
  }
  for (const interval of [
    { start: '', end: '' },
    { start: '2026-10-12T12:00:00Z', end: '' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T12:00:00Z' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T11:00:00Z' },
  ]) {
    expect(() => getClockifyTimeEntryTiming(interval)).toThrow()
  }
})

test('creating a completed copy keeps its context and never calls stop', async () => {
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async () => ({ id: 'new-entry' }))
  const stop = vi.spyOn(clockify, 'stopRunningTimeEntry').mockImplementation(async () => {
    throw new Error('Must not stop')
  })
  const interval = getClockifyTimeEntryIntervalFromMinutes(1, new Date('2026-10-12T12:00:00Z'))
  const entry = {
    billable: true,
    description: 'Task [ref:linear:workspace:TASK-1]',
    projectId: 'project',
    workspaceId: 'workspace',
    taskId: 'task',
    tagIds: ['tag'],
  }

  await createClockifyTimeEntryFromEntry(entry, null, interval)
  expect(create.mock.calls[0]).toStrictEqual([
    {
      billable: true,
      description: entry.description,
      projectId: 'project',
      taskId: 'task',
      tagIds: ['tag'],
      type: 'REGULAR',
      ...interval,
    },
    { params: { workspaceId: 'workspace' } },
  ])
  expect(stop).toHaveBeenCalledTimes(0)

  await createClockifyTimeEntryFromEntry(
    entry,
    { projectId: 'other', projectName: 'Other', workspaceId: 'workspace', workspaceName: 'Workspace' },
    interval,
  )
  const overriddenBody = create.mock.calls[1][0]
  expect(overriddenBody).toBeTruthy()
  expect(overriddenBody.projectId).toBe('other')
  expect('taskId' in overriddenBody).toBe(false)

  await expect(createClockifyTimeEntryFromEntry(entry, null, { start: interval.start, end: '' })).rejects.toThrow()
  expect(create).toHaveBeenCalledTimes(2)
})

afterEach(() => vi.restoreAllMocks())
