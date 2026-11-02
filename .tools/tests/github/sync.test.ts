import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '../../../src/services/db'
import { githubWorkItemSyncQueryOptions } from '../../../src/services/github/sync'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'

const github = vi.hoisted(() => ({
  listForRepo: vi.fn(),
  listForAuthenticatedUser: vi.fn(),
  listPulls: vi.fn(),
  searchPulls: vi.fn(),
}))

vi.mock('../../../src/services/github/client', () => ({
  createGithubClient: async () => ({
    rest: { issues: github, pulls: { list: github.listPulls }, search: { issuesAndPullRequests: github.searchPulls } },
  }),
}))

afterEach(async () => {
  await githubWorkItemCache.clear()
  vi.clearAllMocks()
})

test('sync scopes rows to selected repositories and enabled types, with distinct issue and PR identities', async () => {
  const repo = (name: string, id: number) => ({
    id,
    name,
    owner: 'owner',
    fullName: `owner/${name}`,
    private: false,
    url: `https://github.com/owner/${name}`,
  })
  const first = repo('first', 1)
  const second = repo('second', 2)
  github.listForRepo.mockImplementation(async ({ repo: name }) => ({
    data: [
      {
        number: 7,
        title: `${name} issue`,
        state: 'open',
        updated_at: '2026-01-01',
        html_url: 'https://example.test',
        labels: [],
        user: null,
      },
    ],
  }))
  github.listPulls.mockImplementation(async ({ repo: name, state }) => ({
    data:
      state === 'open'
        ? [
            {
              number: 7,
              title: `${name} pr`,
              state,
              updated_at: '2026-01-02',
              html_url: 'https://example.test',
              labels: [],
              user: null,
              base: { ref: 'main' },
              head: { ref: 'feature' },
            },
          ]
        : [],
  }))
  github.listForAuthenticatedUser.mockResolvedValue({ data: [] })
  github.searchPulls.mockResolvedValue({ data: { items: [] } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const options = (repositories: (typeof first)[], issues: boolean) =>
    githubWorkItemSyncQueryOptions({
      enabled: true,
      interval: 'manual',
      repositories,
      repositorySignature: repositories.map(repository => repository.fullName).join('|'),
      syncLimit: 30,
      visibleWorkItemTypes: { issues, pullRequests: true },
    })
  try {
    await client.fetchQuery(options([first, second], true))
    expect((await db.githubWorkItems.toArray()).map(row => row.id).sort()).toEqual([
      'owner/first:issue:7',
      'owner/first:pullRequest:7',
      'owner/second:issue:7',
      'owner/second:pullRequest:7',
    ])
    await client.fetchQuery(options([second], false))
    expect((await db.githubWorkItems.toArray()).map(row => row.id)).toEqual(['owner/second:pullRequest:7'])
  } finally {
    client.clear()
  }
})

test('manual sync fetches an empty cache on mount and a failed later fetch preserves it', async () => {
  const repository = {
    fullName: 'owner/repo',
    id: 1,
    name: 'repo',
    owner: 'owner',
    private: false,
    url: 'https://github.com/owner/repo',
  }
  github.listForRepo.mockResolvedValue({
    data: [
      {
        number: 7,
        title: 'An issue',
        state: 'open',
        updated_at: '2026-01-01',
        html_url: 'https://github.com/owner/repo/issues/7',
        labels: [],
        user: null,
        body: 'do not store the raw response',
      },
    ],
  })
  github.listForAuthenticatedUser.mockResolvedValue({ data: [] })
  const options = githubWorkItemSyncQueryOptions({
    enabled: true,
    interval: 'manual',
    repositories: [repository],
    repositorySignature: repository.fullName,
    syncLimit: 30,
    visibleWorkItemTypes: { issues: true, pullRequests: false },
  })
  expect(options.refetchInterval).toBe(false)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const observer = new QueryObserver(client, options)
  const unsubscribe = observer.subscribe(() => {})
  try {
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    expect(github.listForRepo).toHaveBeenCalledOnce()
    expect((await db.githubWorkItems.toArray()).map(row => row.title)).toEqual(['An issue'])
    expect((await db.githubWorkItems.toArray())[0].item).toEqual({ labels: [] })

    github.listForAuthenticatedUser.mockRejectedValueOnce(new Error('partial fetch failed'))
    await observer.refetch()
    expect(observer.getCurrentResult().isError).toBe(true)
    expect((await db.githubWorkItems.toArray()).map(row => row.title)).toEqual(['An issue'])
  } finally {
    unsubscribe()
    client.clear()
  }
})
