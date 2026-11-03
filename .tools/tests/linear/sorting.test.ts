import type { LinearTicket } from '../../../src/services/linear/tickets'
import type { SortLinearTicketsOptions } from '../../../src/services/linear/tickets-sorting'

import { afterEach, expect, test, vi } from 'vitest'

import { compareLinearTickets, isLinearTicketTerminal } from '../../../src/services/linear/tickets-sorting'

const now = new Date('2026-01-10T12:00:00Z')
function sortLinearTickets(rows: LinearTicket[], options: SortLinearTicketsOptions) {
  return [...rows].sort((a, b) => compareLinearTickets(a, b, options, Date.now()))
}
function ticket(
  id: string,
  title: string,
  type: string,
  position: number,
  createdDay: number,
  updatedDay: number,
  lastTrackedAt: string | null = null,
): LinearTicket {
  return {
    id,
    identifier: `APP-${id}`,
    title,
    url: `https://linear.app/acme/issue/APP-${id}`,
    assignee: null,
    createdAt: `2026-01-${String(createdDay).padStart(2, '0')}T00:00:00Z`,
    updatedAt: `2026-01-${String(updatedDay).padStart(2, '0')}T00:00:00Z`,
    status: { id: type, name: type, type, position, color: '#fff' },
    lastTrackedAt,
    totalTrackedSeconds: lastTrackedAt ? 1 : null,
    totalTrackedAmount: null,
    totalTrackedAmountCurrency: null,
  }
}
const rows = [
  ticket('A', 'Zulu', 'completed', 1, 1, 8),
  ticket('B', 'Echo', 'backlog', 1, 2, 7, '2026-01-09T12:00:00Z'),
  ticket('C', 'Bravo', 'started', 2, 3, 6, '2026-01-08T12:00:00Z'),
  ticket('D', 'Alpha', 'started', 1, 4, 5, '2026-01-02T12:00:00Z'),
  ticket('E', 'Delta', 'unstarted', 1, 5, 4),
  ticket('F', 'Charlie', 'triage', 1, 6, 3),
  ticket('G', 'Golf', 'backlog', 1, 7, 2),
  ticket('H', 'Hotel', 'unknown', 1, 8, 1),
]

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test.each([
  ['custom', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']],
  ['status', ['D', 'C', 'E', 'F', 'B', 'G', 'A', 'H']],
  ['created', ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']],
  ['updated', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']],
  ['alphabetical', ['D', 'C', 'F', 'E', 'B', 'G', 'H', 'A']],
] as const)('%s order applies across all status buckets', (sortOrder, expected) => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  expect(sortLinearTickets([...rows].reverse(), { sortOrder, activeLinearIssueId: 'A' }).map(row => row.id)).toEqual(
    expected,
  )
})

test('terminal filtering includes unknown states and the seven-day relevance boundary is inclusive', () => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const justInside = ticket('I', 'Inside', 'backlog', 1, 1, 1, '2026-01-03T12:00:00Z')
  const justOutside = ticket('O', 'Outside', 'started', 1, 1, 1, '2026-01-03T11:59:59Z')
  expect(sortLinearTickets([justOutside, justInside], { sortOrder: 'custom' }).map(row => row.id)).toEqual(['I', 'O'])
  expect(rows.filter(isLinearTicketTerminal).map(row => row.id)).toEqual(['A', 'H'])
  expect(rows.filter(row => !isLinearTicketTerminal(row)).map(row => row.id)).toEqual(['B', 'C', 'D', 'E', 'F', 'G'])
})

test('equal comparator keys use the ID as a deterministic final tie-breaker', () => {
  const first = ticket('x', 'Same', 'started', 1, 1, 1)
  const second = { ...first, id: 'different-id' }
  for (const sortOrder of ['custom', 'status', 'created', 'updated', 'alphabetical'] as const) {
    expect(sortLinearTickets([second, first], { sortOrder }).map(row => row.id)).toEqual(['different-id', 'x'])
  }
})
