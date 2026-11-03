import type { McpSnapshot } from '../../../src/services/mcp/snapshot'

import { QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockify } from '../../../src/services/clockify/client'
import { cacheClockifyEntryResult, clearSyncedClockifyTimeEntries } from '../../../src/services/clockify/sync'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { clearSyncedLinearTickets } from '../../../src/services/linear/sync'
import { linearTicketCache } from '../../../src/services/linear/ticket-cache'
import { publishMcpSnapshot, refreshMcpSnapshot } from '../../../src/services/mcp/refresh'
import { listMcpWork } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'
import { mcp } from '../../../src/services/tauri/mcp-client'

afterEach(async () => {
  queryClient.clear()
  await clearSyncedClockifyTimeEntries()
  await clearSyncedLinearTickets()
})

test('refresh publishes current provider caches and Clockify reads before completing', async () => {
  const timestamp = new Date().toISOString()
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace', name: 'Workspace' }])
  queryClient.setQueryData(queryKeys.clockify.projects({ params: { workspaceId: 'workspace' } }), [
    { id: 'project', name: 'Project' },
  ])
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.linear.ticketSync({ params: { syncLimit: 50 } }),
    initialData: { viewerId: null as string | null },
    staleTime: Infinity,
    queryFn: async () => {
      await githubWorkItemCache.replace(
        [
          {
            id: 'owner/repo:pr:123',
            type: 'pullRequest',
            number: 123,
            title: 'New PR',
            url: 'https://github.com/owner/repo/pull/123',
            repositoryFullName: 'owner/repo',
            repositoryOwner: 'owner',
            repositoryUrl: 'https://github.com/owner/repo',
            author: null,
            authorAvatarUrl: null,
            baseBranch: 'main',
            headBranch: 'feature',
            state: 'open',
            updatedAt: timestamp,
            syncedAt: timestamp,
            item: { labels: [] },
          },
        ],
        githubWorkItemCache.beginSync(),
        { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } },
      )
      await linearTicketCache.replace(
        'viewer',
        [
          {
            id: 'ticket',
            identifier: 'APP-1',
            title: 'New ticket',
            url: 'https://linear.app/team/issue/APP-1',
            createdAt: timestamp,
            updatedAt: timestamp,
            assignee: null,
            state: { id: 'todo', name: 'Todo', type: 'unstarted', position: 0, color: '#ffffff' },
          },
        ],
        linearTicketCache.beginSync(),
        timestamp,
      )
      const params = { userId: 'user', workspaceId: 'workspace' }
      queryClient.setQueryData(queryKeys.clockify.runningEntry({ params }), [
        { id: 'running', userId: 'user', timeInterval: { start: timestamp } },
      ])
      queryClient.setQueryData(queryKeys.clockify.summaryReport({ params: { ...params, period: 'today' } }), {
        totals: [{ totalTime: 600 }],
      })
      return { viewerId: 'viewer' }
    },
  })
  onTestFinished(observer.subscribe(() => {}))
  let acknowledge!: () => void
  const acknowledgement = new Promise<void>(resolve => {
    acknowledge = resolve
  })
  let published!: McpSnapshot
  const publish = vi
    .spyOn(mcp, 'publishSnapshot')
    .mockImplementation(async (_capturedAt: string, snapshot: unknown) => {
      published = snapshot as McpSnapshot
      await acknowledgement
    })
  let completed = false
  const pending = refreshMcpSnapshot(() => ({
    clockifyConnected: true,
    githubConnected: true,
    linearConnected: true,
    githubWorkItems: [],
    linearTickets: [],
    linearViewerId: null,
  })).then(result => {
    completed = true
    return result
  })
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
  expect(completed).toBe(false)
  expect(published.trackableWork).toStrictEqual([])
  expect(published.trackingStatus.running?.entryId).toBe('running')
  expect(published.trackingStatus.today.trackedSeconds).toBe(600)
  expect(published.clockifyProjects.projects[0].projectName).toBe('Project')
  acknowledge()
  const result = await pending
  await githubWorkItemCache.clear()
  expect(result.capturedAt).toBe(published.capturedAt)
  expect(result.synced).toStrictEqual(['Linear tickets'])
})

test('a publication failure fails refresh instead of reporting a fresh snapshot', async () => {
  vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async () => {
    throw new Error('Bridge unavailable')
  })
  await expect(refreshMcpSnapshot(() => ({}))).rejects.toThrow(/Bridge unavailable/)
})

test('snapshot resolves a running GitHub reference without publishing the whole archive', async () => {
  const item = {
    id: 'owner/repo:issue:1',
    type: 'issue' as const,
    number: 1,
    title: 'Issue',
    url: 'https://github.com/owner/repo/issues/1',
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
  const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
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
  vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async () => {})
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  queryClient.setQueryData(queryKeys.clockify.runningEntry({ params: { userId: 'user', workspaceId: 'workspace' } }), [
    {
      id: 'running',
      userId: 'user',
      description: 'ref:github:owner/repo:issue:1',
      timeInterval: { start: '2026-01-01' },
    },
  ])
  try {
    await githubWorkItemCache.replace([item], githubWorkItemCache.beginSync(), scope)
    const snapshot = await publishMcpSnapshot({ clockifyConnected: true, githubConnected: true })
    expect(snapshot.trackingStatus.running).toMatchObject({ source: 'github', sourceId: item.id })
    expect(snapshot.trackableWork.filter(row => row.source === 'github')).toEqual([])
  } finally {
    await githubWorkItemCache.clear()
  }
})

test('refreshed GitHub list uses the Clockify state captured after sync, not stale React input', async () => {
  const providerRead = vi.spyOn(clockify, 'getTimeEntries')
  const item = {
    id: 'owner/repo:issue:1',
    type: 'issue' as const,
    number: 1,
    title: 'Fresh issue',
    url: 'https://github.com/owner/repo/issues/1',
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
  const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
  const ref = 'ref:github:owner/repo:issue:1'
  const completedStart = new Date(Date.now() - 1_200_000).toISOString()
  const completedEnd = new Date(Date.now() - 600_000).toISOString()
  const runningStart = new Date(Date.now() - 60_000).toISOString()
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
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.clockify.entrySync({ params: { userId: 'user', workspaceId: 'workspace' } }),
    initialData: {},
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      await cacheClockifyEntryResult({
        id: 'completed',
        userId: 'user',
        workspaceId: 'workspace',
        description: ref,
        timeInterval: { start: completedStart, end: completedEnd },
      })
      queryClient.setQueryData(
        queryKeys.clockify.runningEntry({ params: { userId: 'user', workspaceId: 'workspace' } }),
        [
          {
            id: 'running',
            userId: 'user',
            workspaceId: 'workspace',
            description: ref,
            timeInterval: { start: runningStart },
          },
        ],
      )
      return {}
    },
  })
  onTestFinished(observer.subscribe(() => {}))
  let published!: McpSnapshot
  vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async (_capturedAt, snapshot) => {
    published = snapshot as typeof published
  })
  const stale = {
    clockifyConnected: true,
    githubConnected: true,
    runningEntry: null,
    syncedClockifyEntries: [],
    quickTimersEnabled: true,
    quickTimers: [{ id: 'quick', name: 'Coffee', icon: '', descriptionTemplate: 'Coffee' }],
  }
  try {
    await githubWorkItemCache.replace([item], githubWorkItemCache.beginSync(), scope)
    const refresh = await refreshMcpSnapshot(() => stale)
    const list = await listMcpWork(
      {
        capturedAt: published.capturedAt,

        source: null,
        query: null,
        includeClosed: false,
        limit: 10,
      },
      stale,
      Date.now() + 5000,
    )
    const github = list.rows.find(row => row.source === 'github')!
    const runningSeconds = Math.round((Date.parse(published.capturedAt) - Date.parse(runningStart)) / 1000)
    expect(github).toMatchObject({ id: item.id, isRunning: true, totalTrackedSeconds: 600 + runningSeconds })
    expect(list.rows.map(row => row.source)).toEqual(['github', 'quick_timer'])
    expect(list.capturedAt).toBe(refresh.capturedAt)
    await cacheClockifyEntryResult({
      id: 'later',
      userId: 'user',
      workspaceId: 'workspace',
      description: ref,
      timeInterval: { start: new Date(Date.now() - 300_000).toISOString(), end: new Date().toISOString() },
    })
    const rebuilt = await listMcpWork(
      {
        capturedAt: list.capturedAt,

        source: null,
        query: null,
        includeClosed: false,
        limit: 10,
      },
      stale,
      Date.now() + 5000,
    )
    expect(rebuilt.capturedAt).not.toBe(list.capturedAt)
    expect(rebuilt.rows.find(row => row.id === item.id)?.totalTrackedSeconds).toBe(
      900 + Math.round((Date.parse(rebuilt.capturedAt) - Date.parse(runningStart)) / 1000),
    )
    expect(providerRead).not.toHaveBeenCalled()
  } finally {
    await githubWorkItemCache.clear()
  }
})

test('provider failure cannot publish a successful refresh snapshot', async () => {
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.github.workItemSync(),
    initialData: {},
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      throw new Error('Provider unavailable')
    },
  })
  onTestFinished(observer.subscribe(() => {}))
  const publish = vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async () => {})
  await expect(refreshMcpSnapshot(() => ({}))).rejects.toThrow(/Sync failed: GitHub work items/)
  expect(publish).toHaveBeenCalledTimes(0)
})

afterEach(() => vi.restoreAllMocks())

test('queued captures read the latest scope and cancelled captures do not publish', async () => {
  const { getMcpCapture } = await import('../../../src/services/mcp/refresh')
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'first', activeWorkspace: 'one' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'one' }, { id: 'two' }])
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const publish = vi
    .spyOn(mcp, 'publishSnapshot')
    .mockImplementationOnce(async () => gate)
    .mockResolvedValue()
  const first = publishMcpSnapshot({ clockifyConnected: true })
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'second', activeWorkspace: 'two' })
  const second = publishMcpSnapshot({ clockifyConnected: true })
  const controller = new AbortController()
  const cancelled = publishMcpSnapshot({ clockifyConnected: true }, { signal: controller.signal })
  const rejection = expect(cancelled).rejects.toThrow('cancelled')
  controller.abort()
  release()
  await first
  const current = await second
  await rejection
  expect(getMcpCapture(current.capturedAt)?.scope).toEqual({ userId: 'second', workspaceId: 'two' })
  expect(publish).toHaveBeenCalledTimes(2)
})

test('cancellation while capture is in flight prevents publication', async () => {
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  let started = false
  vi.spyOn(storage, 'get').mockImplementation(async key => {
    if (key === 'githubSelectedRepositories') {
      started = true
      await gate
    }
    return storage.config[key].default
  })
  const publish = vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
  const controller = new AbortController()
  const pending = publishMcpSnapshot({ clockifyConnected: true, githubConnected: true }, { signal: controller.signal })
  const rejection = expect(pending).rejects.toThrow('cancelled')
  await vi.waitFor(() => expect(started).toBe(true))
  controller.abort()
  release()
  await rejection
  expect(publish).not.toHaveBeenCalled()
})

test('a rebuilt mixed capture combines fresh Linear and GitHub totals', async () => {
  const item = {
    id: 'owner/repo:issue:1',
    type: 'issue' as const,
    number: 1,
    title: 'Issue',
    url: 'https://example.test',
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://example.test',
    author: null,
    authorAvatarUrl: null,
    state: 'open',
    updatedAt: '2026-01-01',
    syncedAt: '2026-01-01',
    item: { labels: [] },
  }
  const repo = {
    fullName: 'owner/repo',
    id: 1,
    name: 'repo',
    owner: 'owner',
    private: false,
    url: 'https://example.test',
  }
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'githubSelectedRepositories' ? [repo] : storage.config[key].default,
  )
  vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.linear.ticketSync(),
    initialData: { viewerId: 'viewer' },
    staleTime: Infinity,
    queryFn: async () => ({ viewerId: 'viewer' }),
  })
  onTestFinished(observer.subscribe(() => {}))
  await linearTicketCache.replace(
    'viewer',
    [
      {
        id: 'linear',
        identifier: 'TASK-1',
        title: 'Ticket',
        url: 'https://linear.app/team/issue/TASK-1',
        createdAt: '',
        updatedAt: '',
        assignee: null,
        state: { id: 'open', name: 'open', type: 'unstarted', position: 0, color: '#fff' },
      },
    ],
    linearTicketCache.beginSync(),
    '',
  )
  const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
  const put = async (id: string, description: string, minutes: number) =>
    cacheClockifyEntryResult({
      id,
      userId: 'user',
      workspaceId: 'workspace',
      description,
      timeInterval: {
        start: '2026-01-01T10:00:00Z',
        end: new Date(Date.parse('2026-01-01T10:00:00Z') + minutes * 60000).toISOString(),
      },
    })
  try {
    await githubWorkItemCache.replace([item], githubWorkItemCache.beginSync(), scope)
    await put('linear-1', 'ref:linear:team:TASK-1', 10)
    await put('github-1', 'ref:github:owner/repo:issue:1', 20)
    const input = { clockifyConnected: true, githubConnected: true, linearConnected: true }
    const snapshot = await publishMcpSnapshot(input)
    await put('linear-2', 'ref:linear:team:TASK-1', 5)
    await put('github-2', 'ref:github:owner/repo:issue:1', 5)
    const list = await listMcpWork(
      { capturedAt: snapshot.capturedAt, source: null, query: null, includeClosed: false, limit: 10 },
      input,
      Date.now() + 5000,
    )
    expect(list.capturedAt).not.toBe(snapshot.capturedAt)
    expect(list.rows.find(row => row.source === 'linear')?.totalTrackedSeconds).toBe(900)
    expect(list.rows.find(row => row.source === 'github')?.totalTrackedSeconds).toBe(1500)
  } finally {
    await githubWorkItemCache.clear()
  }
})

test('cancellation during native publication rejects and releases its capture', async () => {
  const { getMcpCapture } = await import('../../../src/services/mcp/refresh')
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const publish = vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async () => gate)
  const controller = new AbortController()
  const pending = publishMcpSnapshot({}, { signal: controller.signal })
  const rejection = expect(pending).rejects.toThrow('cancelled')
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce())
  const capturedAt = publish.mock.calls[0][0]
  controller.abort()
  release()
  await rejection
  expect(getMcpCapture(capturedAt)).toBeUndefined()
})

test('an account change while a capture is queued cannot expose the previous Linear viewer', async () => {
  const { getMcpCapture } = await import('../../../src/services/mcp/refresh')
  const ticket = {
    id: 'old',
    identifier: 'TASK-1',
    title: 'Old',
    url: 'https://linear.app/team/issue/TASK-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    assignee: null,
    state: { id: 'open', name: 'Open', type: 'started', position: 0, color: '#fff' },
  }
  await linearTicketCache.replace('old', [ticket], linearTicketCache.beginSync(), 'now')
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const publish = vi
    .spyOn(mcp, 'publishSnapshot')
    .mockImplementationOnce(async () => gate)
    .mockResolvedValue()
  const first = publishMcpSnapshot({ linearConnected: true })
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce())
  const queued = publishMcpSnapshot({ linearConnected: true })
  linearTicketCache.invalidate()
  await linearTicketCache.replace('new', [{ ...ticket, id: 'new' }], linearTicketCache.beginSync(), 'later')
  release()
  await first
  const fresh = await queued
  expect(getMcpCapture(fresh.capturedAt)?.linearViewerId).toBe('new')
})
