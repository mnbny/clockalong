import type { McpSnapshot } from '../../../src/services/mcp/snapshot'

import { QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { clockifyTimeEntriesCollection } from '../../../src/services/clockify/sync'
import { githubWorkItemsCollection } from '../../../src/services/github/sync'
import { linearTicketsCollection } from '../../../src/services/linear/sync'
import { refreshMcpSnapshot } from '../../../src/services/mcp/refresh'
import { mcp } from '../../../src/services/tauri/mcp-client'

afterEach(() => queryClient.clear())

test('refresh publishes current provider caches and Clockify reads before completing', async () => {
  const timestamp = new Date().toISOString()
  let githubRows: typeof githubWorkItemsCollection.toArray = []
  let linearRows: typeof linearTicketsCollection.toArray = []
  vi.spyOn(githubWorkItemsCollection, 'toArray', 'get').mockImplementation(() => githubRows)
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
      githubRows = [
        {
          id: 'owner/repo:pr:123',
          $key: 'owner/repo:pr:123',
          $collectionId: 'github',
          $origin: 'remote',
          $synced: true,
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
      ]
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
  await new Promise(resolve => setImmediate(resolve))

  expect(publish).toHaveBeenCalledTimes(1)
  expect(completed).toBe(false)
  expect(published.trackableWork.map(row => row.title)).toStrictEqual(['New ticket', 'New PR'])
  expect(published.trackingStatus.running?.entryId).toBe('running')
  expect(published.trackingStatus.today.trackedSeconds).toBe(600)
  expect(published.clockifyProjects.projects[0].projectName).toBe('Project')
  acknowledge()
  const result = await pending
  expect(result.capturedAt).toBe(published.capturedAt)
  expect(result.synced).toStrictEqual(['Linear tickets'])
})

test('a publication failure fails refresh instead of reporting a fresh snapshot', async () => {
  vi.spyOn(githubWorkItemsCollection, 'toArray', 'get').mockImplementation(() => [])
  vi.spyOn(linearTicketsCollection, 'toArray', 'get').mockImplementation(() => [])
  vi.spyOn(clockifyTimeEntriesCollection, 'toArray', 'get').mockImplementation(() => [])
  vi.spyOn(mcp, 'publishSnapshot').mockImplementation(async () => {
    throw new Error('Bridge unavailable')
  })
  await expect(refreshMcpSnapshot(() => ({}))).rejects.toThrow(/Bridge unavailable/)
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
