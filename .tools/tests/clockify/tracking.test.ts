import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'
import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'
import type { LinearTicket } from '../../../src/services/linear/tickets'

import { afterEach, expect, test, vi } from 'vitest'

import { clockify } from '../../../src/services/clockify/client'
import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { queryClockifySummaries } from '../../../src/services/clockify/entry-queries'
import {
  getClockifyEntryLinearTicket,
  getLinearTicketInternalRef,
} from '../../../src/services/clockify/ticket-summaries'
import {
  createClockifyTimeEntryFromEntry,
  getClockifyTimeEntryUpdateBody,
  stopClockifyTimeEntry,
} from '../../../src/services/clockify/time-entries'
import { DB } from '../../../src/services/db'
import {
  getClockifyEntryGithubWorkItem,
  getGithubWorkItemInternalRef,
} from '../../../src/services/github/work-item-summaries'
import { sortLinearTickets } from '../../../src/services/linear/tickets-sorting'

const now = new Date('2026-01-02T12:00:00Z')
const ticket: LinearTicket = {
  id: 'linear',
  identifier: 'TASK-7',
  title: 'Linear task',
  url: 'https://linear.app/acme/issue/TASK-7',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  assignee: null,
  status: { id: 's', name: 'Started', type: 'started', position: 1, color: '#fff' },
  lastTrackedAt: null,
  totalTrackedAmount: null,
  totalTrackedAmountCurrency: null,
  totalTrackedSeconds: null,
}
const github: SyncedGithubWorkItem = {
  id: 'owner/repo:issue:7',
  type: 'issue',
  number: 7,
  title: 'GitHub issue',
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
function entry(
  id: string,
  description: string,
  start: string,
  end: string | undefined,
  currency = 'USD',
): TimeEntryWithRatesDtoV1 {
  return {
    id,
    description,
    userId: 'user',
    workspaceId: 'workspace',
    timeInterval: { start, end },
    hourlyRate: { amount: 12000, currency },
  }
}

test('provider summaries deduplicate running entries, match refs, and retain currency rules', async () => {
  const completed = entry('done', 'ref:linear:acme:TASK-7', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z')
  const running = entry('running', 'ref:linear:ACME:task-7', '2026-01-02T11:30:00Z', undefined)
  const otherCurrency = entry('eur', 'ref:linear:acme:TASK-7', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z', 'EUR')
  const gh = entry('github', 'ref:github:OWNER/repo:issue:7', '2026-01-02T08:00:00Z', '2026-01-02T09:00:00Z')
  const db = new DB(`tracking-${crypto.randomUUID()}`)
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const cache = createClockifyEntryCache(db)
  try {
    for (const row of [completed, running, otherCurrency, gh]) await cache.upsert(row, scope)
    expect(getClockifyEntryLinearTicket(running, [ticket])?.id).toBe('linear')
    expect(getClockifyEntryGithubWorkItem(gh, [github])?.id).toBe(github.id)
    expect(
      (
        await queryClockifySummaries(
          db,
          scope,
          [ticket],
          item => item.id,
          getLinearTicketInternalRef,
          [running, running],
          now,
        )
      ).linear,
    ).toEqual({
      lastTrackedAt: '2026-01-02T11:30:00Z',
      totalTrackedSeconds: 9000,
      totalTrackedAmount: 180,
      totalTrackedAmountCurrency: 'USD',
    })
    expect(
      (
        await queryClockifySummaries(
          db,
          scope,
          [github],
          item => item.id,
          getGithubWorkItemInternalRef,
          [running, running],
          now,
        )
      )[github.id],
    ).toMatchObject({
      totalTrackedSeconds: 3600,
      totalTrackedAmount: 120,
      totalTrackedAmountCurrency: 'USD',
    })
  } finally {
    db.close()
    await db.delete()
  }
})

test('Linear relevance keeps the running ticket first and recent tracked work ahead of older open work', () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  const tracked = {
    ...ticket,
    id: 'tracked',
    identifier: 'TASK-8',
    status: { ...ticket.status, type: 'backlog' },
    lastTrackedAt: '2026-01-02T11:00:00Z',
    totalTrackedSeconds: 60,
  }
  const idle = { ...ticket, id: 'idle', identifier: 'TASK-9' }
  const closed = {
    ...ticket,
    id: 'closed',
    identifier: 'TASK-10',
    status: { ...ticket.status, type: 'completed' },
    lastTrackedAt: '2026-01-02T11:00:00Z',
  }
  expect(
    sortLinearTickets([closed, idle, tracked, ticket], { sortOrder: 'custom', activeLinearIssueId: 'linear' }).map(
      row => row.id,
    ),
  ).toEqual(['linear', 'tracked', 'idle', 'closed'])
})

test('resume, stop and edit preserve entry fields and target the chosen workspace', async () => {
  const original: TimeEntryWithRatesDtoV1 = {
    id: 'entry',
    userId: 'user',
    workspaceId: 'workspace',
    description: 'Task',
    billable: true,
    projectId: 'old-project',
    taskId: 'task',
    tagIds: ['tag'],
    type: 'REGULAR',
    timeInterval: { start: '2026-01-02T10:00:00Z', end: '2026-01-02T11:00:00Z' },
  }
  const create = vi.spyOn(clockify, 'createTimeEntry').mockResolvedValue({})
  const stop = vi.spyOn(clockify, 'stopRunningTimeEntry').mockResolvedValue({})
  const override = {
    projectId: 'new-project',
    projectName: 'New',
    workspaceId: 'other-workspace',
    workspaceName: 'Other',
  }
  const start = new Date('2026-01-02T10:15:00Z')
  const end = new Date('2026-01-02T11:15:00Z')
  await createClockifyTimeEntryFromEntry(original, override, { start: start.toISOString(), end: end.toISOString() })
  expect(create.mock.calls[0][0]).toMatchObject({
    billable: true,
    description: 'Task',
    projectId: 'new-project',
    tagIds: ['tag'],
    start: start.toISOString(),
    end: end.toISOString(),
  })
  expect(create.mock.calls[0][0]).not.toHaveProperty('taskId')
  expect(create.mock.calls[0][1]).toMatchObject({ params: { workspaceId: 'other-workspace' } })
  expect(getClockifyTimeEntryUpdateBody(original, start, end)).toMatchObject({
    description: 'Task',
    projectId: 'old-project',
    taskId: 'task',
    tagIds: ['tag'],
    start: start.toISOString(),
    end: end.toISOString(),
  })
  await stopClockifyTimeEntry(original)
  expect(stop.mock.calls[0][1]).toMatchObject({ params: { userId: 'user', workspaceId: 'workspace' } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
