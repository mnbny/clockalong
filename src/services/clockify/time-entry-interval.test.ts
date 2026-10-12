import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clockify } from './client'
import { createClockifyTimeEntryFromEntry } from './time-entries'
import { getClockifyTimeEntryIntervalFromMinutes, getClockifyTimeEntryTiming } from './time-entry-interval'

test('manual minutes preserve fractional minutes and cross midnight', () => {
  const interval = getClockifyTimeEntryIntervalFromMinutes(1.5, new Date('2026-10-12T00:01:00Z'))
  assert.deepEqual(interval, { start: '2026-10-11T23:59:30.000Z', end: '2026-10-12T00:01:00.000Z' })
  assert.deepEqual(getClockifyTimeEntryTiming(interval), interval)
  assert.equal('end' in getClockifyTimeEntryTiming(), false)
})

test('invalid durations and incomplete or reversed intervals cannot create timers', () => {
  for (const minutes of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => getClockifyTimeEntryIntervalFromMinutes(minutes))
  }
  for (const interval of [
    { start: '', end: '' },
    { start: '2026-10-12T12:00:00Z', end: '' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T12:00:00Z' },
    { start: '2026-10-12T12:00:00Z', end: '2026-10-12T11:00:00Z' },
  ]) {
    assert.throws(() => getClockifyTimeEntryTiming(interval))
  }
})

test('creating a completed copy keeps its context and never calls stop', async t => {
  const create = t.mock.method(clockify, 'createTimeEntry', async () => ({ id: 'new-entry' }))
  const stop = t.mock.method(clockify, 'stopRunningTimeEntry', async () => {
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
  assert.deepEqual(create.mock.calls[0].arguments, [
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
  assert.equal(stop.mock.callCount(), 0)

  await createClockifyTimeEntryFromEntry(
    entry,
    { projectId: 'other', projectName: 'Other', workspaceId: 'workspace', workspaceName: 'Workspace' },
    interval,
  )
  const overriddenBody = create.mock.calls[1].arguments[0]
  assert.ok(overriddenBody)
  assert.equal(overriddenBody.projectId, 'other')
  assert.equal('taskId' in overriddenBody, false)

  await assert.rejects(createClockifyTimeEntryFromEntry(entry, null, { start: interval.start, end: '' }))
  assert.equal(create.mock.callCount(), 2)
})
