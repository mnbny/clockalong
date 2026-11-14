// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, Profiler, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { appToast } from '../../../src/components/AppToaster'
import { ClockifyWidget } from '../../../src/components/ClockifyWidget'
import { queryKeys } from '../../../src/lib/query-client'
import { clockify, clockifyReports } from '../../../src/services/clockify/client'
import * as collapseEntries from '../../../src/services/clockify/collapse-entries'
import { clockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import * as overlapRepair from '../../../src/services/clockify/overlap-repair'
import { db } from '../../../src/services/db'

vi.mock('../../../src/services/clockify/client', () => ({
  clockify: {
    getLoggedUser: async () => ({ id: 'user', activeWorkspace: 'workspace' }),
    getWorkspacesOfUser: async () => [{ id: 'workspace', name: 'Workspace' }],
    getTimeEntries: async () => [],
    deleteTimeEntry: async () => {},
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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
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
  const week = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Week')!
  await act(async () => week.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Yesterday entry'))
  expect(entryCommits.length).toBeGreaterThan(0)
  expect(entryCommits.every(Boolean)).toBe(true)
  const localFailure = vi.spyOn(db.clockifyEntries, 'where').mockImplementation(() => {
    throw new Error('Local read failed')
  })
  const todayButton = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Today')!
  await act(async () => todayButton.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Local read failed'))
  localFailure.mockRestore()
  const retry = [...container!.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Retry')!
  await act(async () => retry.click())
  await vi.waitFor(() => expect(container!.textContent).toContain('Today entry'))
  expect(container!.textContent).not.toContain('Local read failed')
})

test('cached calendar periods match reports, paginate week and month, and keep today complete without refetching', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(clockify, 'getLoggedUser').mockResolvedValue({
    id: 'user',
    activeWorkspace: 'workspace',
    settings: { dateFormat: 'MM/DD/YYYY', timeFormat: 'HOUR12', timeZone: 'America/Los_Angeles', weekStart: 'SUNDAY' },
  })
  const entryRequests = vi.spyOn(clockify, 'getTimeEntries')
  const reportRequests = vi.spyOn(clockifyReports, 'generateSummaryReport')
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const todayEntries = Array.from({ length: 20 }, (_, index) => ({
    id: `today-${index}`,
    start: new Date(Date.parse('2026-11-13T08:00:00Z') + index * 60_000),
  }))
  for (const { id, start } of [
    ...todayEntries,
    { id: 'week-start', start: new Date('2026-11-08T08:00:00Z') },
    { id: 'before-week', start: new Date('2026-11-08T07:59:00Z') },
    { id: 'month-start', start: new Date('2026-11-01T07:00:00Z') },
    { id: 'before-month', start: new Date('2026-11-01T06:59:00Z') },
  ]) {
    await clockifyEntryCache.upsert(
      {
        ...scope,
        id,
        description: id,
        timeInterval: { start: start.toISOString(), end: new Date(start.getTime() + 60_000).toISOString() },
      },
      scope,
    )
  }
  await mount()
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Show Clockify entries"]')!.click(),
  )
  const button = (label: string) =>
    [...container!.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  const rows = () =>
    [...container!.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row => row.cells[1]?.textContent)
  const newestToday = todayEntries.map(entry => entry.id).reverse()
  await vi.waitFor(() => expect(rows()).toEqual(newestToday))
  expect(button('Next')).toBeUndefined()
  await vi.waitFor(() => expect(reportRequests).toHaveBeenCalledTimes(3))
  expect(
    reportRequests.mock.calls.map(([request]) => ({
      start: request.dateRangeStart,
      end: request.dateRangeEnd,
      weekStart: request.weekStart,
      timeZone: request.timeZone,
    })),
  ).toEqual([
    {
      start: '2026-11-13T08:00:00.000',
      end: '2026-11-14T07:59:59.999',
      weekStart: 'SUNDAY',
      timeZone: 'America/Los_Angeles',
    },
    {
      start: '2026-11-08T08:00:00.000',
      end: '2026-11-15T07:59:59.999',
      weekStart: 'SUNDAY',
      timeZone: 'America/Los_Angeles',
    },
    {
      start: '2026-11-01T07:00:00.000',
      end: '2026-12-01T07:59:59.999',
      weekStart: 'SUNDAY',
      timeZone: 'America/Los_Angeles',
    },
  ])
  expect(entryRequests).toHaveBeenCalledTimes(1)

  await act(async () => button('Week')!.click())
  await vi.waitFor(() => expect(button('Next')?.disabled).toBe(false))
  expect(rows()).toEqual(newestToday.slice(0, 15))
  expect(button('Previous')?.disabled).toBe(true)
  await act(async () => button('Next')!.click())
  expect(rows()).toEqual([...newestToday.slice(15), 'week-start'])
  expect(button('Next')?.disabled).toBe(true)
  await act(async () => button('Previous')!.click())
  expect(rows()).toEqual(newestToday.slice(0, 15))
  await act(async () => button('Next')!.click())

  await act(async () => button('Month')!.click())
  await vi.waitFor(() => expect(button('Next')?.disabled).toBe(false))
  expect(rows()).toEqual(newestToday.slice(0, 15))
  await act(async () => button('Next')!.click())
  expect(rows()).toEqual([...newestToday.slice(15), 'week-start', 'before-week', 'month-start'])
  expect(button('Next')?.disabled).toBe(true)

  await act(async () => button('Today')!.click())
  await vi.waitFor(() => expect(rows()).toEqual(newestToday))
  expect(button('Next')).toBeUndefined()

  await act(async () => button('Month')!.click())
  await vi.waitFor(() => expect(button('Next')?.disabled).toBe(false))
  await act(async () => button('Next')!.click())
  await act(async () => {
    for (const id of rows()) await clockifyEntryCache.remove(id!, scope)
  })
  await vi.waitFor(() => expect(rows()).toEqual(newestToday.slice(0, 15)))
  expect(button('Next')).toBeUndefined()
  expect(entryRequests).toHaveBeenCalledTimes(1)
  expect(reportRequests).toHaveBeenCalledTimes(3)
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
    timeInterval: { start: '2026-11-02T10:17:00Z', end: '2026-11-02T10:17:00Z' },
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

test('deleting an entry requires confirmation, supports cancellation and removes it only after success', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const entry = {
    ...scope,
    id: 'delete-me',
    description: 'Disposable entry',
    timeInterval: { start: '2026-11-08T10:17:00Z', end: '2026-11-08T10:17:00Z' },
  }
  await clockifyEntryCache.upsert(entry, scope)
  await clockifyEntryCache.upsert({ ...entry, id: 'keep-me', description: 'Keep entry' }, scope)
  const running = {
    ...entry,
    id: 'running',
    description: 'Running entry',
    timeInterval: { start: entry.timeInterval.start },
  }
  vi.spyOn(clockify, 'getTimeEntries').mockResolvedValue([running])
  let finish!: () => void
  const remove = vi.spyOn(clockify, 'deleteTimeEntry').mockReturnValue(
    new Promise(resolve => {
      finish = resolve
    }),
  )
  const refresh = vi.spyOn(client, 'invalidateQueries')
  await mount()
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Show Clockify entries"]')!.click(),
  )
  const getDelete = () => container!.querySelector<HTMLButtonElement>('button[aria-label="Delete Disposable entry"]')!
  await vi.waitFor(() => expect(getDelete()).not.toBeNull())
  expect(getDelete().previousElementSibling?.getAttribute('aria-label')).toBe('Edit Disposable entry')

  await act(async () => getDelete().click())
  const getDialog = () => container!.querySelector('dialog')!
  expect(getDialog().open).toBe(true)
  expect(getDialog().textContent).toContain('Disposable entry')
  expect(getDialog().textContent).toContain('0s')
  expect(remove).not.toHaveBeenCalled()
  await act(async () => getDialog().querySelector<HTMLButtonElement>('button.btn-ghost')!.click())
  expect(getDialog()).toBeNull()
  await act(async () => getDelete().click())
  await act(async () => getDialog().querySelector<HTMLButtonElement>('button[aria-label="Cancel deletion"]')!.click())
  expect(getDialog()).toBeNull()
  expect(remove).not.toHaveBeenCalled()

  await act(async () => getDelete().click())
  const confirm = getDialog().querySelector<HTMLButtonElement>('button.btn-error')!
  await act(async () => confirm.click())
  await vi.waitFor(() => expect(confirm.disabled).toBe(true))
  expect(getDialog().querySelector<HTMLButtonElement>('button.btn-ghost')!.disabled).toBe(true)
  expect(getDialog().dispatchEvent(new Event('cancel', { cancelable: true }))).toBe(false)
  await act(async () => confirm.click())
  expect(remove).toHaveBeenCalledExactlyOnceWith(undefined, {
    params: { workspaceId: scope.workspaceId, id: entry.id },
  })
  expect(await db.clockifyEntries.get([scope.userId, scope.workspaceId, entry.id])).toBeDefined()

  await act(async () => finish())
  await vi.waitFor(() => expect(getDialog()).toBeNull())
  await vi.waitFor(() => expect(getDelete()).toBeNull())
  expect(await db.clockifyEntries.get([scope.userId, scope.workspaceId, entry.id])).toBeUndefined()
  expect(container!.textContent).toContain('Keep entry')
  expect(container!.textContent).toContain('Running entry')
  expect(refresh).toHaveBeenCalledWith({ queryKey: queryKeys.clockify.entrySync() })
  expect(refresh).toHaveBeenCalledWith({ queryKey: queryKeys.clockify.summaryReport() })
  expect(refresh).toHaveBeenCalledWith({ queryKey: queryKeys.clockify.runningEntry() })
})

test('a failed deletion keeps the entry and confirmation available for retry', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T20:00:00Z'))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const errorToast = vi.spyOn(appToast, 'error').mockImplementation(() => 'error')
  const scope = { userId: 'user', workspaceId: 'workspace' }
  await clockifyEntryCache.upsert(
    {
      ...scope,
      id: 'entry',
      description: 'Retry entry',
      timeInterval: { start: '2026-11-08T10:17:00Z', end: '2026-11-08T10:18:00Z' },
    },
    scope,
  )
  const remove = vi
    .spyOn(clockify, 'deleteTimeEntry')
    .mockRejectedValueOnce(new Error('Delete denied'))
    .mockResolvedValueOnce(undefined)
  await mount()
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('button[aria-label="Show Clockify entries"]')!.click(),
  )
  const getDelete = () => container!.querySelector<HTMLButtonElement>('button[aria-label="Delete Retry entry"]')!
  await vi.waitFor(() => expect(getDelete()).not.toBeNull())
  await act(async () => getDelete().click())
  const confirm = container!.querySelector<HTMLButtonElement>('dialog button.btn-error')!
  await act(async () => confirm.click())
  await vi.waitFor(() =>
    expect(errorToast).toHaveBeenCalledWith('Could not delete Clockify entry', { description: 'Delete denied' }),
  )
  expect(container!.querySelector('dialog')!.open).toBe(true)
  expect(confirm.disabled).toBe(false)
  expect(await db.clockifyEntries.get([scope.userId, scope.workspaceId, 'entry'])).toBeDefined()
  await act(async () => confirm.click())
  await vi.waitFor(() => expect(getDelete()).toBeNull())
  expect(remove).toHaveBeenCalledTimes(2)
  expect(container!.querySelector('dialog')).toBeNull()
})
