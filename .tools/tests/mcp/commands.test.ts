import type { McpCommandPayload } from '../../../src/services/tauri/mcp-client'

import { afterEach, expect, test, vi } from 'vitest'

import { queryClient } from '../../../src/lib/query-client'
import { clockify } from '../../../src/services/clockify/client'
import { executeMcpCommand, type ExecuteMcpCommandContext } from '../../../src/services/mcp/commands'
import { storage } from '../../../src/services/storage/config'

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

test('adding Quick Timer time preserves the running association and resolves template values', async () => {
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

afterEach(() => vi.restoreAllMocks())
