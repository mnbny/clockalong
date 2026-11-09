// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, Profiler, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { ClockifyWidget } from '../../../src/components/ClockifyWidget'
import * as collapseEntries from '../../../src/services/clockify/collapse-entries'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import * as overlapRepair from '../../../src/services/clockify/overlap-repair'
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
      clockifyCollapseThresholdMinutes: 5,
      clockifyCollapseChunkMinutes: 60,
      clockifyCollapseExcludeInvoiced: true,
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
let entryCommits: boolean[] = []
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
          { id: 'clockify', onRender: () => entryCommits.push(container!.textContent!.includes('Today entry')) },
          createElement(ClockifyWidget),
        ),
      ),
    ),
  )
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  client.clear()
  entryCommits = []
  vi.restoreAllMocks()
  vi.useRealTimers()
  await clockifyEntryCache.clear()
  await db.clockifyCollapses.clear()
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
  entryCommits = []
  const threeDays = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === '3 days')!
  await act(async () => threeDays.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Yesterday entry'))
  expect(entryCommits.length).toBeGreaterThan(0)
  expect(entryCommits.every(Boolean)).toBe(true)
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

test('the header only shows a red repair badge for monthly overlaps and prevents repeat submissions', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  let finish!: (result: { updatedCount: number; refreshFailed: boolean }) => void
  const repair = vi.spyOn(overlapRepair, 'fixClockifyMonthOverlaps').mockReturnValue(
    new Promise(resolve => {
      finish = resolve
    }),
  )
  await mount()
  const getButton = () => container!.querySelector<HTMLButtonElement>('button[aria-label="Fix overlaps this month"]')
  expect(getButton()).toBeNull()

  await act(async () => {
    for (const id of ['first', 'overlap']) {
      await clockifyEntryCache.upsert(
        {
          id,
          userId: 'user',
          workspaceId: 'workspace',
          timeInterval: { start: '2026-11-02T12:00:00Z', end: '2026-11-02T13:00:00Z' },
        },
        { userId: 'user', workspaceId: 'workspace' },
      )
    }
  })
  await vi.waitFor(() => expect(getButton()?.disabled).toBe(false))
  const button = getButton()!
  expect(button.closest('header')).not.toBeNull()
  expect(button.textContent?.trim()).toBe('Fix overlaps')
  expect(button.nextElementSibling?.textContent).toBe('Not Running')
  expect(button.classList.contains('badge-error')).toBe(true)

  await act(async () => button.click())
  await vi.waitFor(() => expect(button.disabled).toBe(true))
  await act(async () => button.click())
  expect(repair).toHaveBeenCalledExactlyOnceWith({ userId: 'user', workspaceId: 'workspace' }, undefined)
  expect(container!.querySelector('dialog')).toBeNull()
  await act(async () => {
    await clockifyEntryCache.upsert(
      {
        id: 'overlap',
        userId: 'user',
        workspaceId: 'workspace',
        timeInterval: { start: '2026-11-02T13:00:00Z', end: '2026-11-02T14:00:00Z' },
      },
      { userId: 'user', workspaceId: 'workspace' },
    )
    finish({ updatedCount: 1, refreshFailed: false })
  })
  await vi.waitFor(() => expect(getButton()).toBeNull())
})

test('the collapse badge follows cached eligibility and disables repeated clicks until resync completes', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  let finish!: (result: { createdCount: number; deletedCount: number; refreshFailed: boolean }) => void
  const collapse = vi.spyOn(collapseEntries, 'collapseClockifyMonthEntries').mockReturnValue(
    new Promise(resolve => {
      finish = resolve
    }),
  )
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const first = {
    ...scope,
    id: 'first',
    description: 'Same task',
    invoiced: false,
    timeInterval: { start: '2026-11-02T10:17:00Z', end: '2026-11-02T10:17:05Z' },
  }
  const second = {
    ...first,
    id: 'second',
    timeInterval: { start: '2026-11-02T10:50:00Z', end: '2026-11-02T10:50:17Z' },
  }
  await clockifyEntryCache.upsert(first, scope)
  await clockifyEntryCache.upsert({ ...second, invoiced: true }, scope)
  await mount()
  const getButton = () =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Collapse entries this month"]')
  expect(getButton()).toBeNull()
  await act(async () => {
    await clockifyEntryCache.upsert(second, scope)
  })
  await vi.waitFor(() => expect(getButton()?.disabled).toBe(false))
  const button = getButton()!
  expect(button.closest('header')).not.toBeNull()
  expect(button.textContent?.trim()).toBe('Collapse entries')
  await act(async () => button.click())
  await vi.waitFor(() => expect(button.disabled).toBe(true))
  await act(async () => button.click())
  expect(collapse).toHaveBeenCalledExactlyOnceWith(scope, undefined)
  await act(async () => {
    await clockifyEntryCache.clear()
    finish({ createdCount: 1, deletedCount: 2, refreshFailed: false })
  })
  await vi.waitFor(() => expect(getButton()).toBeNull())
})
