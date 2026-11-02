// @vitest-environment happy-dom
import type * as TanstackDb from '@tanstack/react-db'
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, Profiler, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { GitHubWidget } from '../../../src/components/GitHubWidget'
import { LinearWidget } from '../../../src/components/LinearWidget'
import * as entryQueries from '../../../src/services/clockify/entry-queries'

const state = vi.hoisted(() => ({ rows: [] }))
vi.mock('../../../src/hooks/useAppAuth', () => ({
  useAppAuth: () => ({ loading: false, value: { githubAuthenticated: true, linearAuthenticated: true } }),
}))
vi.mock('../../../src/hooks/useClockifyTimerProject', () => ({ useClockifyTimerProject: () => null }))
vi.mock('../../../src/services/github/sync', () => ({
  useGithubSync: () => ({ queries: { cacheQuery: { isSuccess: true }, syncQuery: { isSuccess: true } } }),
}))
vi.mock('../../../src/services/linear/sync', () => ({
  linearTicketsCollection: {},
  useLinearSync: () => ({ lastSyncResult: { viewerId: 'viewer' }, queries: { syncQuery: { isSuccess: true } } }),
}))
vi.mock('../../../src/services/github/client', () => ({
  createGithubClient: async () => ({
    rest: { users: { getAuthenticated: async () => ({ data: { login: 'viewer' } }) } },
  }),
}))
vi.mock('../../../src/services/clockify/client', () => ({
  clockify: {
    getLoggedUser: async () => ({ id: 'user', activeWorkspace: 'workspace' }),
    getWorkspacesOfUser: async () => [{ id: 'workspace' }],
    getTimeEntries: async () => [],
  },
}))
vi.mock('@tanstack/react-db', async original => ({
  ...(await original<typeof TanstackDb>()),
  useLiveQuery: () => ({ data: state.rows }),
}))
vi.mock('../../../src/services/storage/useStorage', () => ({
  useStorage: (key: string) => {
    const defaults: Record<string, unknown> = {
      githubSelectedRepositories: [],
      githubVisibleWorkItemTypes: { issues: true, pullRequests: true },
      githubSelectedAuthors: [],
      githubSelectedLabels: [],
      githubShowClosedWorkItems: false,
      linearTicketSyncLimit: 50,
      linearTicketSortOrder: 'custom',
      clockifyBillable: true,
    }
    const [value, setValue] = useState(defaults[key])
    return [value, async (next: unknown) => setValue(next), async () => {}]
  },
}))

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
let root: Root | undefined
let container: HTMLDivElement | undefined
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  client.clear()
  vi.restoreAllMocks()
})

test.each([
  ['GitHub', GitHubWidget],
  ['Linear', LinearWidget],
])('%s widget keeps a read error stable and retries', async (_name, Widget) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let renders = 0
  const read = vi.spyOn(entryQueries, 'queryClockifySummaries').mockRejectedValue(new Error('Totals unavailable'))
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
          {
            id: 'widget',
            onRender: () => {
              renders++
              if (renders > 60) throw new Error('Widget render loop')
            },
          },
          createElement(Widget),
        ),
      ),
    ),
  )
  await vi.waitFor(() => expect(container!.textContent).toContain('Totals unavailable'))
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
  })
  expect(renders).toBeLessThan(60)
  const callsBeforeRetry = read.mock.calls.length
  read.mockResolvedValue({})
  const retry = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Retry')!
  await act(async () => retry.click())
  await vi.waitFor(() => expect(container!.textContent).not.toContain('Totals unavailable'))
  await vi.waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(callsBeforeRetry))
})
