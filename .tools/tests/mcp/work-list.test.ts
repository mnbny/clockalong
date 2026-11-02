import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { afterEach, expect, test, vi } from 'vitest'

import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { listMcpWork } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'

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
  const nonGithubRows = [
    {
      id: 'linear',
      identifier: 'LIN-1',
      internalRef: null,
      isRunning: false,
      lastTrackedAt: null,
      repository: null,
      source: 'linear' as const,
      status: 'open',
      title: 'linear',
      totalTrackedAmount: null,
      totalTrackedAmountCurrency: null,
      totalTrackedSeconds: 0,
      updatedAt: null,
      url: null,
      isClosed: false,
    },
    {
      id: 'quick',
      identifier: null,
      internalRef: null,
      isRunning: false,
      lastTrackedAt: null,
      repository: null,
      source: 'quick_timer' as const,
      status: null,
      title: 'quick',
      totalTrackedAmount: null,
      totalTrackedAmountCurrency: null,
      totalTrackedSeconds: 0,
      updatedAt: null,
      url: null,
      isClosed: false,
    },
  ]
  const args = {
    capturedAt: '2026-01-01T00:00:00Z',
    nonGithubRows,
    source: null,
    query: null,
    includeClosed: false,
    limit: 2,
    githubConnected: true,
    githubTracking: [],
  }
  const mixed = await listMcpWork(args, { githubConnected: true }, Date.now() + 5000)
  expect(mixed.rows.map(row => row.source)).toEqual(['linear', 'github'])
  expect(mixed.truncated).toBe(true)
  expect(mixed.rows.every(row => !('isClosed' in row))).toBe(true)
  const match = await listMcpWork(
    { ...args, source: 'github', query: 'NEEDLE', limit: 1 },
    { githubConnected: true },
    Date.now() + 5000,
  )
  expect(match.rows.map(row => row.id)).toEqual(['owner/repo:issue:1'])
  expect(match.truncated).toBe(false)
  const closed = await listMcpWork(
    { ...args, source: 'github', query: 'issue 2', includeClosed: true, limit: 200 },
    { githubConnected: true },
    Date.now() + 5000,
  )
  expect(closed.rows.some(row => row.id === 'owner/repo:issue:2')).toBe(true)
  const controller = new AbortController()
  controller.abort()
  await expect(listMcpWork(args, { githubConnected: true }, Date.now() + 5000, controller.signal)).rejects.toThrow(
    'cancelled',
  )
  await expect(listMcpWork(args, { githubConnected: true }, Date.now() - 1)).rejects.toThrow('timed out')
})
