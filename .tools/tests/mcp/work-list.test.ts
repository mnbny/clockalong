import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { linearTicketsCollection } from '../../../src/services/linear/sync'
import { publishMcpSnapshot } from '../../../src/services/mcp/refresh'
import { listMcpWork } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'
import { mcp } from '../../../src/services/tauri/mcp-client'

const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
const repo = {
  fullName: 'owner/repo',
  id: 1,
  name: 'repo',
  owner: 'owner',
  private: false,
  url: 'https://github.com/owner/repo',
}
function item(index: number): SyncedGithubWorkItem {
  return {
    id: `owner/repo:issue:${index}`,
    type: 'issue',
    number: index,
    title: index === 1 ? 'deep needle' : `issue ${index}`,
    url: 'https://example.test',
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://example.test',
    author: null,
    authorAvatarUrl: null,
    state: index === 2 ? 'closed' : 'open',
    updatedAt: '2026-01-01',
    syncedAt: '2026-01-01',
    item: { labels: [] },
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  queryClient.clear()
  await githubWorkItemCache.clear()
})

test('list searches beyond the output limit, respects scope and combines sources in order', async () => {
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'githubSelectedRepositories' ? [repo] : storage.config[key].default,
  )
  await githubWorkItemCache.replace(
    Array.from({ length: 250 }, (_, i) => item(i + 1)),
    githubWorkItemCache.beginSync(),
    scope,
  )
  const observer = new QueryObserver(queryClient, {
    queryKey: queryKeys.linear.ticketSync(),
    initialData: { viewerId: 'viewer' },
    staleTime: Infinity,
    queryFn: async () => ({ viewerId: 'viewer' }),
  })
  onTestFinished(observer.subscribe(() => {}))
  vi.spyOn(linearTicketsCollection, 'toArray', 'get').mockReturnValue([
    {
      id: 'linear',
      viewerId: 'viewer',
      syncedAt: '',
      updatedAt: '',
      $key: 'linear',
      $collectionId: 'linear',
      $origin: 'remote',
      $synced: true,
      ticket: {
        id: 'linear',
        identifier: 'LIN-1',
        title: 'linear',
        url: 'https://linear.app/team/issue/LIN-1',
        createdAt: '',
        updatedAt: '',
        assignee: null,
        state: { id: 'open', name: 'open', type: 'unstarted', position: 0, color: '#fff' },
      },
    },
  ])
  vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
  const input = {
    githubConnected: true,
    linearConnected: true,
    quickTimersEnabled: true,
    quickTimers: [{ id: 'quick', name: 'quick', icon: '', descriptionTemplate: 'quick' }],
  }
  const snapshot = await publishMcpSnapshot(input)
  const args = {
    capturedAt: snapshot.capturedAt,

    source: null,
    query: null,
    includeClosed: false,
    limit: 2,
  }
  const mixed = await listMcpWork(args, input, Date.now() + 5000)
  expect(mixed.rows.map(row => row.source)).toEqual(['linear', 'github'])
  expect(mixed.truncated).toBe(true)
  expect(mixed.rows.every(row => !('isClosed' in row))).toBe(true)
  const match = await listMcpWork({ ...args, source: 'github', query: 'NEEDLE', limit: 1 }, input, Date.now() + 5000)
  expect(match.rows.map(row => row.id)).toEqual(['owner/repo:issue:1'])
  expect(match.truncated).toBe(false)
  const closed = await listMcpWork(
    { ...args, source: 'github', query: 'issue 2', includeClosed: true, limit: 200 },
    input,
    Date.now() + 5000,
  )
  expect(closed.rows.some(row => row.id === 'owner/repo:issue:2')).toBe(true)
  const controller = new AbortController()
  controller.abort()
  await expect(listMcpWork(args, input, Date.now() + 5000, controller.signal)).rejects.toThrow('cancelled')
  await expect(listMcpWork(args, input, Date.now() - 1)).rejects.toThrow('timed out')
})

test('GitHub time attribution is stable across search, closed filtering and output limits', async () => {
  const { cacheClockifyEntryResult, clearSyncedClockifyTimeEntries } =
    await import('../../../src/services/clockify/sync')
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'githubSelectedRepositories' ? [repo] : storage.config[key].default,
  )
  vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user', activeWorkspace: 'workspace' })
  queryClient.setQueryData(queryKeys.clockify.workspaces, [{ id: 'workspace' }])
  await githubWorkItemCache.replace(
    [
      { ...item(1), state: 'closed' },
      { ...item(2), state: 'open' },
      { ...item(3), id: 'other/repo:issue:3', repositoryFullName: 'other/repo' },
    ],
    githubWorkItemCache.beginSync(),
    { ...scope, repositories: ['owner/repo', 'other/repo'] },
  )
  await cacheClockifyEntryResult({
    id: 'time',
    userId: 'user',
    workspaceId: 'workspace',
    description: 'ref:github:owner/repo:issue:1 ref:github:owner/repo:issue:2',
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  })
  await cacheClockifyEntryResult({
    id: 'unknown-first',
    userId: 'user',
    workspaceId: 'workspace',
    description: 'ref:github:owner/repo:issue:999 ref:github:other/repo:issue:3 ref:github:owner/repo:issue:2',
    timeInterval: { start: '2026-01-01T11:00:00Z', end: '2026-01-01T11:10:00Z' },
  })
  const input = { clockifyConnected: true, githubConnected: true }
  try {
    const snapshot = await publishMcpSnapshot(input)
    const args = {
      capturedAt: snapshot.capturedAt,
      source: 'github' as const,
      query: null,
      includeClosed: true,
      limit: 10,
    }
    const all = await listMcpWork(args, input, Date.now() + 5000)
    expect(all.rows.find(row => row.id === item(1).id)?.totalTrackedSeconds).toBe(3600)
    expect(all.rows.find(row => row.id === item(2).id)?.totalTrackedSeconds).toBe(600)
    const filtered = await listMcpWork(
      { ...args, query: 'issue 2', includeClosed: false, limit: 1 },
      input,
      Date.now() + 5000,
    )
    expect(filtered.rows).toHaveLength(1)
    expect(filtered.rows[0]).toMatchObject({ id: item(2).id, totalTrackedSeconds: 600 })
  } finally {
    await clearSyncedClockifyTimeEntries()
  }
})
