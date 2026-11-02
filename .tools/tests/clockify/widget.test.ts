// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { ClockifyWidget } from '../../../src/components/ClockifyWidget'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { db } from '../../../src/services/db'

vi.mock('../../../src/services/clockify/client', () => ({
  clockify: {
    getLoggedUser: async () => ({ id: 'user', activeWorkspace: 'workspace' }),
    getWorkspacesOfUser: async () => [{ id: 'workspace', name: 'Workspace' }],
    getTimeEntries: async () => [],
  },
  clockifyReports: { generateSummaryReport: async () => ({ totals: [] }) },
}))
vi.mock('../../../src/services/storage/useStorage', () => ({
  useStorage: (key: string) => {
    const defaults: Record<string, unknown> = {
      clockifyDefaultProject: null,
      clockifyOverrideProject: null,
      clockifyOverrideProjectVisibility: false,
      quickTimersActiveEntry: null,
    }
    const [value, setValue] = useState(defaults[key])
    return [value, async (next: unknown) => setValue(next), async () => {}]
  },
}))

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
let root: Root | undefined
let container: HTMLDivElement | undefined
async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(QueryClientProvider, { client }, createElement(ClockifyWidget))))
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  client.clear()
  vi.restoreAllMocks()
  await clockifyEntryCache.clear()
})

test('widget reads current date ranges live and recovers from a local read failure', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const today = new Date()
  today.setHours(10, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  await clockifyEntryCache.upsert(
    {
      id: 'today',
      userId: 'user',
      workspaceId: 'workspace',
      description: 'Today entry',
      timeInterval: { start: today.toISOString(), end: new Date(today.getTime() + 3600000).toISOString() },
    },
    { userId: 'user', workspaceId: 'workspace' },
  )
  await clockifyEntryCache.upsert(
    {
      id: 'yesterday',
      userId: 'user',
      workspaceId: 'workspace',
      description: 'Yesterday entry',
      timeInterval: { start: yesterday.toISOString(), end: new Date(yesterday.getTime() + 3600000).toISOString() },
    },
    { userId: 'user', workspaceId: 'workspace' },
  )
  await mount()
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Show Clockify entries"]')!.click(),
  )
  await vi.waitFor(() => expect(container!.textContent).toContain('Today entry'))
  expect(container!.textContent).not.toContain('Yesterday entry')
  const threeDays = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === '3 days')!
  await act(async () => threeDays.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Yesterday entry'))
  const localFailure = vi.spyOn(db.clockifyEntries, 'where').mockImplementation(() => {
    throw new Error('Local read failed')
  })
  const oneDay = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === '1 day')!
  await act(async () => oneDay.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Local read failed'))
  localFailure.mockRestore()
  const retry = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Retry')!
  await act(async () => retry.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Today entry'))
  expect(container!.textContent).not.toContain('Local read failed')
})
