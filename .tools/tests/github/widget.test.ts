// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, Profiler, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { GitHubWidget } from '../../../src/components/GitHubWidget'
import { db } from '../../../src/services/db'
import { githubWorkItemCache } from '../../../src/services/github/work-item-cache'

vi.mock('../../../src/hooks/useAppAuth', () => ({
  useAppAuth: () => ({ loading: false, value: { githubAuthenticated: true } }),
}))
vi.mock('../../../src/hooks/useClockifyTimerProject', () => ({ useClockifyTimerProject: () => null }))
vi.mock('../../../src/services/github/sync', () => ({
  useGithubSync: () => ({
    queries: {
      syncQuery: {
        isLoading: false,
        isError: false,
        isSuccess: true,
      },
    },
  }),
}))
vi.mock('../../../src/services/github/client', () => ({
  createGithubClient: async () => ({
    rest: { users: { getAuthenticated: async () => ({ data: { login: 'viewer', avatar_url: null } }) } },
  }),
}))
vi.mock('../../../src/services/clockify/client', () => ({
  clockify: { getLoggedUser: async () => ({}), getWorkspacesOfUser: async () => [] },
}))

vi.mock('../../../src/services/storage/useStorage', () => ({
  useStorage: (key: string) => {
    const defaults: Record<string, unknown> = {
      githubSelectedRepositories: [
        { fullName: 'owner/repo', owner: 'owner', name: 'repo', id: 1, url: 'https://example.test', private: false },
      ],
      githubVisibleWorkItemTypes: { issues: true, pullRequests: true },
      githubSelectedAuthors: [],
      githubSelectedLabels: [],
      githubShowClosedWorkItems: false,
      clockifyBillable: true,
      githubIssueDescriptionTemplate: '{title}',
      githubIssueDescriptionTemplateFallback: 'n/a',
      githubPullRequestDescriptionTemplate: '{title}',
      githubPullRequestDescriptionTemplateFallback: 'n/a',
    }
    const [value, setValue] = useState(defaults[key])
    return [value, async (next: unknown) => setValue(next), async () => {}]
  },
}))

let root: Root | undefined
let container: HTMLDivElement | undefined
let rowCommits: number[] = []
const scope = { repositories: ['owner/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  client.clear()
  rowCommits = []
  vi.restoreAllMocks()
  await githubWorkItemCache.clear()
})
async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root?.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          Profiler,
          { id: 'github', onRender: () => rowCommits.push(container!.querySelectorAll('tbody tr').length) },
          createElement(GitHubWidget),
        ),
      ),
    ),
  )
}
function button(text: string) {
  return [...container!.querySelectorAll('button')].find(candidate => candidate.textContent?.trim() === text)!
}

test('widget toggles, empty state and paging use live database rows', async () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    id: `owner/repo:issue:${index}`,
    type: 'issue' as const,
    number: index,
    title: `Issue ${index}`,
    url: 'https://example.test',
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://example.test',
    author: 'other',
    authorAvatarUrl: null,
    state: 'open',
    updatedAt: '2026-01-01',
    syncedAt: '2026-01-01',
    item: { labels: [] },
    involvementReasons: index === 0 ? ['mentioned' as const] : [],
  }))
  await githubWorkItemCache.replace(rows, githubWorkItemCache.beginSync(), scope)
  await mount()
  await vi.waitFor(() => expect(container!.textContent).toContain('No GitHub work items found.'))
  const showAll = container!.querySelector<HTMLInputElement>('input[aria-label="Show all GitHub work items"]')!
  await act(async () => showAll.click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(50))
  rowCommits = []
  await act(async () => button('Next').click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(5))
  const closed = container!.querySelector<HTMLInputElement>('input[aria-label="Show closed GitHub work items"]')!
  await act(async () => closed.click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(50))
  await act(async () => closed.click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(50))
  expect(button('Previous').disabled).toBe(true)
  await vi.waitFor(() => expect(button('Next').disabled).toBe(false))
  await act(async () => button('Next').click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(5))
  await act(async () =>
    githubWorkItemCache.replace([{ ...rows[0], title: 'Updated' }], githubWorkItemCache.beginSync(), scope),
  )
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(50))
  await act(async () =>
    githubWorkItemCache.replace(
      [
        {
          ...rows[0],
          id: 'owner/repo:issue:55',
          number: 55,
          title: 'New issue',
          involvementReasons: [],
        },
      ],
      githubWorkItemCache.beginSync(),
      scope,
    ),
  )
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(50))
  await vi.waitFor(() => expect(container!.textContent).toContain('New issue'))
  await act(async () => button('Next').click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(6))
  expect(rowCommits.every(count => count > 0)).toBe(true)
  await act(async () => showAll.click())
  const mentions = container!.querySelector<HTMLInputElement>(
    'input[aria-label="Show GitHub work items that mention you or request your review"]',
  )!
  await act(async () => mentions.click())
  await vi.waitFor(() => expect(container!.querySelectorAll('tbody tr')).toHaveLength(1))
  expect(container!.textContent).toContain('Updated')
  await act(async () => githubWorkItemCache.clear())
  await vi.waitFor(() => expect(container!.textContent).toContain('No GitHub work items found.'))
})

test('a live-query failure is visible in the widget', async () => {
  const failure = vi.spyOn(db.githubWorkItemIndex, 'where').mockImplementation(() => {
    throw new Error('index unavailable')
  })
  await mount()
  await act(async () =>
    container!.querySelector<HTMLInputElement>('input[aria-label="Show all GitHub work items"]')!.click(),
  )
  await vi.waitFor(() => expect(container!.textContent).toContain('index unavailable'))
  failure.mockRestore()
  await act(async () => button('Retry local data').click())
  await vi.waitFor(() => expect(container!.textContent).toContain('No GitHub work items found.'))
})
