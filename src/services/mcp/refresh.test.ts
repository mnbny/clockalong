import type { SyncedGithubWorkItem } from '../github/sync'
import type { SyncedLinearTicket } from '../linear/sync'
import type { McpSnapshot } from './snapshot'

import { QueryObserver } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { queryClient, queryKeys } from '../../lib/query-client'
import { clockifyTimeEntriesCollection } from '../clockify/sync'
import { githubWorkItemsCollection } from '../github/sync'
import { linearTicketsCollection } from '../linear/sync'
import { mcp } from '../tauri/mcp-client'
import { refreshMcpSnapshot } from './refresh'

afterEach(() => queryClient.clear())

test('refresh publishes current provider caches and Clockify reads before completing', async t => {
  const timestamp = new Date().toISOString()
  let githubRows: SyncedGithubWorkItem[] = []
  let linearRows: SyncedLinearTicket[] = []
  t.mock.getter(githubWorkItemsCollection, 'toArray', () => githubRows)
  t.mock.getter(linearTicketsCollection, 'toArray', () => linearRows)
  t.mock.getter(clockifyTimeEntriesCollection, 'toArray', () => [])
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
  t.after(observer.subscribe(() => {}))
  let acknowledge!: () => void
  const acknowledgement = new Promise<void>(resolve => {
    acknowledge = resolve
  })
  let published!: McpSnapshot
  const publish = t.mock.method(mcp, 'publishSnapshot', async (_capturedAt: string, snapshot: unknown) => {
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

  assert.equal(publish.mock.callCount(), 1)
  assert.equal(completed, false)
  assert.deepEqual(
    published.trackableWork.map(row => row.title),
    ['New ticket', 'New PR'],
  )
  assert.equal(published.trackingStatus.running?.entryId, 'running')
  assert.equal(published.trackingStatus.today.trackedSeconds, 600)
  assert.equal(published.clockifyProjects.projects[0].projectName, 'Project')
  acknowledge()
  const result = await pending
  assert.equal(result.capturedAt, published.capturedAt)
  assert.deepEqual(result.synced, ['Linear tickets'])
})

test('a publication failure fails refresh instead of reporting a fresh snapshot', async t => {
  t.mock.getter(githubWorkItemsCollection, 'toArray', () => [])
  t.mock.getter(linearTicketsCollection, 'toArray', () => [])
  t.mock.getter(clockifyTimeEntriesCollection, 'toArray', () => [])
  t.mock.method(mcp, 'publishSnapshot', async () => {
    throw new Error('Bridge unavailable')
  })
  await assert.rejects(
    refreshMcpSnapshot(() => ({})),
    /Bridge unavailable/,
  )
})

test('provider failure cannot publish a successful refresh snapshot', async t => {
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.github.workItemSync(),
    initialData: {},
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      throw new Error('Provider unavailable')
    },
  })
  t.after(observer.subscribe(() => {}))
  const publish = t.mock.method(mcp, 'publishSnapshot', async () => {})
  await assert.rejects(
    refreshMcpSnapshot(() => ({})),
    /Sync failed: GitHub work items/,
  )
  assert.equal(publish.mock.callCount(), 0)
})
