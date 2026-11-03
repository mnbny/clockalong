import type { AssignedIssueNode } from '../../../src/services/linear/tickets'

import { afterEach, expect, test, vi } from 'vitest'

import { queryClient } from '../../../src/lib/query-client'
import { clockify } from '../../../src/services/clockify/client'
import { db } from '../../../src/services/db'
import { clearSyncedLinearTickets } from '../../../src/services/linear/sync'
import { createLinearTicketCache, linearTicketCache } from '../../../src/services/linear/ticket-cache'
import { executeMcpCommand, type ExecuteMcpCommandContext } from '../../../src/services/mcp/commands'
import { storage } from '../../../src/services/storage/config'

function ticket(id: string): AssignedIssueNode {
  const date = '2026-01-01T10:00:00Z'
  return {
    id,
    identifier: `APP-${id}`,
    title: `Ticket ${id}`,
    url: `https://linear.app/acme/issue/APP-${id}`,
    createdAt: date,
    updatedAt: date,
    assignee: null,
    state: { id: 's', name: 'Todo', type: 'unstarted', position: 1, color: '#fff' },
  }
}
const context: ExecuteMcpCommandContext = {
  clockifyConnected: true,
  githubConnected: false,
  linearConnected: true,
  linearViewerId: 'viewer',
  runningEntry: null,
  clockifyTimerProject: {
    projectId: 'project',
    projectName: 'Project',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
  },
}
afterEach(async () => {
  vi.restoreAllMocks()
  queryClient.clear()
  await clearSyncedLinearTickets()
})

test('Linear timer commands resolve only IDs owned by the current viewer', async () => {
  await linearTicketCache.replace('viewer', [ticket('1')], linearTicketCache.beginSync(), 'now')
  const other = createLinearTicketCache(db)
  await other.replace('other', [ticket('2')], other.beginSync(), 'now')
  vi.spyOn(storage, 'get').mockImplementation(async key => storage.config[key].default)
  vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  const create = vi.spyOn(clockify, 'createTimeEntry').mockImplementation(async body => ({
    id: 'clockify',
    description: body.description,
    timeInterval: { start: '2026-01-01T10:00:00Z' },
  }))
  const command = (id: string) => ({
    tool: 'start_timer' as const,
    requestId: 'request',
    arguments: { source: 'linear' as const, id },
  })
  expect(await executeMcpCommand(command('missing'), context)).toMatchObject({
    ok: false,
    error: { code: 'unknown_target' },
  })
  expect(await executeMcpCommand(command('2'), context)).toMatchObject({ ok: false, error: { code: 'unknown_target' } })
  expect(create).not.toHaveBeenCalled()
  expect(await executeMcpCommand(command('1'), context)).toMatchObject({
    ok: true,
    result: { description: expect.stringContaining('ref:linear:acme:APP-1') },
  })
  expect(create).toHaveBeenCalledOnce()
})

test('a disconnect and reconnect during command preparation rejects the old viewer target', async () => {
  await linearTicketCache.replace('viewer', [ticket('1')], linearTicketCache.beginSync(), 'now')
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const waiting = new Promise<void>(resolve => {
    started = resolve
  })
  vi.spyOn(storage, 'get').mockImplementation(async key => {
    if (key === 'clockifyDescriptionTemplate') {
      started()
      await gate
    }
    return storage.config[key].default
  })
  const create = vi.spyOn(clockify, 'createTimeEntry')
  const pending = executeMcpCommand(
    { tool: 'start_timer', requestId: 'request', arguments: { source: 'linear', id: '1' } },
    context,
  )
  await waiting
  linearTicketCache.invalidate()
  await linearTicketCache.replace('other', [ticket('1')], linearTicketCache.beginSync(), 'later')
  release()
  expect(await pending).toMatchObject({ ok: false, error: { code: 'unknown_target' } })
  expect(create).not.toHaveBeenCalled()
})
