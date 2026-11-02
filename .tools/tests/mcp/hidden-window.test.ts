// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'

import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { listMcpWork } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'

const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
afterEach(async () => {
  vi.restoreAllMocks()
  await githubWorkItemCache.clear()
})

test('a hidden webview can answer cached GitHub list requests', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'githubSelectedRepositories'
      ? [{ fullName: 'owner/repo', id: 1, name: 'repo', owner: 'owner', private: false, url: 'https://example.test' }]
      : storage.config[key].default,
  )
  await githubWorkItemCache.replace(
    [
      {
        id: 'owner/repo:issue:1',
        type: 'issue',
        number: 1,
        title: 'Hidden query',
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
      },
    ],
    githubWorkItemCache.beginSync(),
    scope,
  )
  const result = await listMcpWork(
    {
      capturedAt: '2026-01-01T00:00:00Z',
      nonGithubRows: [],
      source: 'github',
      query: null,
      includeClosed: false,
      limit: 10,
      githubConnected: true,
      githubTracking: [],
    },
    { githubConnected: true },
    Date.now() + 5000,
  )
  expect(result.rows.map(row => row.title)).toEqual(['Hidden query'])
})
