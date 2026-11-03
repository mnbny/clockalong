// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'

import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'
import { clearSyncedLinearTickets } from '../../../src/services/linear/sync'
import { linearTicketCache } from '../../../src/services/linear/ticket-cache'
import { publishMcpSnapshot } from '../../../src/services/mcp/refresh'
import { listMcpWork } from '../../../src/services/mcp/work-list'
import { storage } from '../../../src/services/storage/config'
import { mcp } from '../../../src/services/tauri/mcp-client'

const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
afterEach(async () => {
  vi.restoreAllMocks()
  await githubWorkItemCache.clear()
  await clearSyncedLinearTickets()
})

test('a hidden webview can answer cached GitHub list requests', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
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
  const snapshot = await publishMcpSnapshot({ githubConnected: true })
  const result = await listMcpWork(
    {
      capturedAt: snapshot.capturedAt,

      source: 'github',
      query: null,
      includeClosed: false,
      limit: 10,
    },
    { githubConnected: true },
    Date.now() + 5000,
  )
  expect(result.rows.map(row => row.title)).toEqual(['Hidden query'])
})

test('a hidden webview can answer cached Linear lists without GitHub', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  vi.spyOn(mcp, 'publishSnapshot').mockResolvedValue()
  await linearTicketCache.replace(
    'viewer',
    [
      {
        id: 'one',
        identifier: 'TASK-1',
        title: 'Hidden Linear',
        url: 'https://linear.app/team/issue/TASK-1',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        assignee: null,
        state: { id: 'open', name: 'Open', type: 'started', position: 0, color: '#fff' },
      },
    ],
    linearTicketCache.beginSync(),
    'now',
  )
  const input = { linearConnected: true, githubConnected: false }
  const snapshot = await publishMcpSnapshot(input)
  const result = await listMcpWork(
    { capturedAt: snapshot.capturedAt, source: 'linear', query: null, includeClosed: false, limit: 10 },
    input,
    Date.now() + 5000,
  )
  expect(result.rows.map(row => row.title)).toEqual(['Hidden Linear'])
})
