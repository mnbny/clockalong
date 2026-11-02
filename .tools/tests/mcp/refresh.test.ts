import type { McpSnapshot } from '../../../src/services/mcp/snapshot'

import { QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockifyTimeEntriesCollection } from '../../../src/services/clockify/sync'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { linearTicketsCollection } from '../../../src/services/linear/sync'
import { publishMcpSnapshot, refreshMcpSnapshot } from '../../../src/services/mcp/refresh'
import { listMcpWork, type McpListWorkArguments } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'
import { mcp } from '../../../src/services/tauri/mcp-client'

afterEach(() => queryClient.clear())

test('refresh publishes current provider caches and Clockify reads before completing', async () => {
  const timestamp = new Date().toISOString()
  let linearRows: typeof linearTicketsCollection.toArray = []
  vi.spyOn(linearTicketsCollection, 'toArray', 'get').mockImplementation(() => linearRows)
  vi.spyOn(clockifyTimeEntriesCollection, 'toArray', 'get').mockImplementation(() => [])
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
      linearRows = [
        {
          id: 'ticket',
          $key: 'ticket',
          $collectionId: 'linear',
          $origin: 'remote',
          $synced: true,
          viewerId: 'viewer',
          syncedAt: timestamp,
          updatedAt: timestamp,
          ticket: {
            id: 'ticket',
            identifier: 'APP-1',
            title: 'New ticket',
            url: 'https://linear.app/team/issue/APP-1',
            createdAt: timestamp,
            updatedAt: timestamp,
            assignee: null,
            state: { id: 'todo', name: 'Todo', type: 'unstarted', position: 0, color: '#ffffff' },
          },
        },
      ]
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
  expect(published.trackableWork.map(row => row.title)).toStrictEqual(['New ticket'])
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
  vi.spyOn(linearTicketsCollection, 'toArray', 'get').mockImplementation(() => [])
  vi.spyOn(clockifyTimeEntriesCollection, 'toArray', 'get').mockImplementation(() => [])
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
  let entries: typeof clockifyTimeEntriesCollection.toArray = []
  vi.spyOn(clockifyTimeEntriesCollection, 'toArray', 'get').mockImplementation(() => entries)
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
      entries = [
        {
          id: 'completed',
          userId: 'user',
          workspaceId: 'workspace',
          startedAt: completedStart,
          syncedAt: completedEnd,
          entry: {
            id: 'completed',
            userId: 'user',
            workspaceId: 'workspace',
            description: ref,
            timeInterval: { start: completedStart, end: completedEnd },
          },
        },
      ] as typeof entries
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
  let published!: McpSnapshot & { githubTracking: McpListWorkArguments['githubTracking'] }
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
        githubConnected: true,
        githubTracking: published.githubTracking,
        nonGithubRows: published.trackableWork,
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
