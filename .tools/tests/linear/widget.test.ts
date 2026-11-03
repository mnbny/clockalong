// @vitest-environment happy-dom
import type * as LinearSync from '../../../src/services/linear/sync'
import type { AssignedIssueNode } from '../../../src/services/linear/tickets'
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { LinearWidget } from '../../../src/components/LinearWidget'
import { db } from '../../../src/services/db'
import { clearSyncedLinearTickets } from '../../../src/services/linear/sync'
import { createLinearTicketCache, linearTicketCache } from '../../../src/services/linear/ticket-cache'

const widgetState = vi.hoisted(() => ({ status: 'success' }))
vi.mock('../../../src/hooks/useAppAuth', () => ({
  useAppAuth: () => ({ loading: false, value: { linearAuthenticated: true } }),
}))
vi.mock('../../../src/hooks/useClockifyTimerProject', () => ({ useClockifyTimerProject: () => null }))
vi.mock('../../../src/services/linear/sync', async original => ({
  ...(await original<typeof LinearSync>()),
  useLinearSync: () => ({
    viewerId: 'viewer',
    queries: {
      syncQuery: {
        isSuccess: widgetState.status === 'success',
        isLoading: widgetState.status === 'loading',
        isError: widgetState.status === 'error',
      },
    },
  }),
}))
vi.mock('../../../src/services/clockify/client', () => ({
  clockify: { getLoggedUser: async () => ({}), getWorkspacesOfUser: async () => [] },
}))
vi.mock('../../../src/services/storage/useStorage', () => ({
  useStorage: (key: string) => {
    const defaults: Record<string, unknown> = {
      linearTicketSyncLimit: 2,
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
function ticket(id: string, title: string, type: string, day: number): AssignedIssueNode {
  const date = `2026-01-0${day}T00:00:00Z`
  return {
    id,
    identifier: `APP-${id}`,
    title,
    url: `https://linear.app/acme/issue/APP-${id}`,
    createdAt: date,
    updatedAt: date,
    assignee: null,
    state: { id: type, type, name: type, position: 1, color: '#fff' },
  }
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  client.clear()
  vi.restoreAllMocks()
  widgetState.status = 'success'
  await clearSyncedLinearTickets()
})

test.each([
  ['success', 'No assigned tickets found.'],
  ['error', 'Could not load Linear tickets.'],
])('widget shows the %s state when there are no rows', async (status, message) => {
  widgetState.status = status
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(QueryClientProvider, { client }, createElement(LinearWidget))))
  await vi.waitFor(() => expect(container!.textContent).toContain(message))
})

test('widget shows a spinner while the Linear sync loads', async () => {
  widgetState.status = 'loading'
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(QueryClientProvider, { client }, createElement(LinearWidget))))
  expect(container!.querySelector('.loading-spinner')).not.toBeNull()
})

test('widget displays retained rows beyond the fetch limit and sorts them and Show all changes terminal visibility', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  await linearTicketCache.replace(
    'viewer',
    [ticket('1', 'Zulu', 'started', 1), ticket('2', 'Alpha', 'completed', 2), ticket('3', 'Bravo', 'started', 3)],
    linearTicketCache.beginSync(),
    'now',
  )
  const other = createLinearTicketCache(db)
  await other.replace('other-viewer', [ticket('4', 'Foreign', 'started', 1)], other.beginSync(), 'now')
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(QueryClientProvider, { client }, createElement(LinearWidget))))
  const tableText = () => container!.querySelector('tbody')!.textContent
  await vi.waitFor(() => expect(tableText()).toContain('Zulu'))
  expect(tableText()).not.toContain('Alpha')
  expect(tableText()).toContain('Bravo')
  expect(tableText()).not.toContain('Foreign')
  await act(async () =>
    container!
      .querySelector<HTMLInputElement>('input[aria-label="Show all Linear tickets, including terminal states"]')!
      .click(),
  )
  await vi.waitFor(() => expect(tableText()).toContain('Alpha'))
  const select = container!.querySelector<HTMLSelectElement>('select[aria-label="Ticket sort order"]')!
  await act(async () => {
    select.value = 'alphabetical'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await vi.waitFor(() =>
    expect([...container!.querySelectorAll('tbody tr')].map(item => item.textContent)).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Bravo'),
      expect.stringContaining('Zulu'),
    ]),
  )
  expect(tableText()).toContain('Bravo')
})

test('paging resets when filters change and when a live ticket edit changes ordering', async () => {
  const tickets = Array.from({ length: 56 }, (_, index) =>
    ticket(
      String(index).padStart(2, '0'),
      `Title ${String(index).padStart(2, '0')}`,
      index === 55 ? 'completed' : 'started',
      1,
    ),
  )
  await linearTicketCache.replace('viewer', tickets, linearTicketCache.beginSync(), 'now')
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(QueryClientProvider, { client }, createElement(LinearWidget))))
  const button = (name: string) =>
    [...container!.querySelectorAll('button')].find(item => item.textContent?.trim() === name)!
  const showAll = () =>
    container!.querySelector<HTMLInputElement>(
      'input[aria-label="Show all Linear tickets, including terminal states"]',
    )!
  await vi.waitFor(() => expect(button('Next')?.disabled).toBe(false))
  await act(async () => button('Next').click())
  await vi.waitFor(() => expect(button('Previous').disabled).toBe(false))
  await act(async () => showAll().click())
  await vi.waitFor(() => expect(button('Previous').disabled).toBe(true))
  await act(async () => showAll().click())
  await vi.waitFor(() => expect(button('Previous').disabled).toBe(true))
  await vi.waitFor(() => expect(button('Next').disabled).toBe(false))
  await act(async () => button('Next').click())
  await vi.waitFor(() => expect(button('Previous').disabled).toBe(false))
  await act(async () =>
    linearTicketCache.replace(
      'viewer',
      [{ ...tickets[0], title: 'Updated live' }],
      linearTicketCache.beginSync(),
      'later',
    ),
  )
  await vi.waitFor(() => expect(button('Previous').disabled).toBe(true))
  expect(container!.textContent).toContain('Updated live')
})
