import type { CreateTimeEntryRequest } from '../clockify/generated/clockify'
import type { McpCommandPayload } from '../tauri/mcp-client'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { queryClient } from '../../lib/query-client'
import { clockify } from '../clockify/client'
import { storage } from '../storage/config'
import { executeMcpCommand, type ExecuteMcpCommandContext } from './commands'

const context = {
  clockifyConnected: true,
  clockifyTimerProject: {
    projectId: 'project',
    projectName: 'Project',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
  },
  linearViewerId: null,
  runningEntry: { id: 'running-entry', timeInterval: { start: '2026-10-12T20:00:00Z' } },
} satisfies ExecuteMcpCommandContext

test('adding Quick Timer time preserves the running association and resolves template values', async t => {
  t.mock.method(storage, 'get', async (key: keyof typeof storage.config) => {
    if (key === 'quickTimers')
      return [{ id: 'preset', name: 'Meeting', icon: '', descriptionTemplate: '{name}: {topic}' }]
    if (key === 'quickTimersCache') return [{ id: 'preset', values: { name: 'Alex', topic: 'Old topic' } }]
    return storage.config[key].default
  })
  const set = t.mock.method(storage, 'set', async () => {})
  t.mock.method(queryClient, 'invalidateQueries', async () => {})
  const create = t.mock.method(clockify, 'createTimeEntry', async (body: CreateTimeEntryRequest = {}) => ({
    id: 'new-entry',
    billable: body.billable,
    description: body.description,
    timeInterval: { start: body.start, end: body.end },
  }))
  const stop = t.mock.method(clockify, 'stopRunningTimeEntry', async () => {
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

  assert.deepEqual(result, {
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
  assert.equal(create.mock.callCount(), 1)
  assert.equal(create.mock.calls[0].arguments[0]?.projectId, 'project')
  assert.equal(
    set.mock.calls.some(call => call.arguments[0] === 'quickTimersCache'),
    true,
  )
  assert.equal(
    set.mock.calls.some(call => call.arguments[0] === 'quickTimersActiveEntry'),
    false,
  )
  assert.equal(stop.mock.callCount(), 0)

  const started = await executeMcpCommand(
    { tool: 'start_timer', requestId: 'start', arguments: { source: 'quick_timer', id: 'preset' } },
    context,
  )
  assert.equal(started.ok, true)
  assert.equal('end' in create.mock.calls[1].arguments[0]!, false)
  assert.equal(
    set.mock.calls.some(call => call.arguments[0] === 'quickTimersActiveEntry'),
    true,
  )
})

test('invalid duration, missing project, disconnected Clockify, and unknown work cannot create time', async t => {
  const create = t.mock.method(clockify, 'createTimeEntry', async () => {
    throw new Error('Must not create')
  })
  t.mock.method(storage, 'get', async (key: keyof typeof storage.config) => storage.config[key].default)
  const command = {
    tool: 'add_time_entry',
    requestId: 'test',
    arguments: { source: 'quick_timer', id: 'unknown', durationMinutes: 1 },
  } satisfies McpCommandPayload
  for (const durationMinutes of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.equal(
      (await executeMcpCommand({ ...command, arguments: { ...command.arguments, durationMinutes } }, context)).ok,
      false,
    )
  }
  assert.equal(
    (await executeMcpCommand({ ...command, arguments: { ...command.arguments, endedAt: 'invalid' } }, context)).ok,
    false,
  )
  assert.deepEqual(await executeMcpCommand(command, { ...context, clockifyTimerProject: null }), {
    ok: false,
    error: {
      code: 'missing_project',
      message: 'No Clockify project is selected. Choose a default project in Clockalong settings.',
    },
  })
  const disconnected = await executeMcpCommand(command, { ...context, clockifyConnected: false })
  assert.equal(disconnected.ok, false)
  const unknown = await executeMcpCommand(command, context)
  assert.equal(unknown.ok, false)
  if (!unknown.ok) assert.equal(unknown.error.code, 'unknown_target')
  assert.equal(create.mock.callCount(), 0)
})
