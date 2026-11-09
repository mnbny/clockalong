import type { AssignedIssueNode } from '../../../src/services/linear/tickets'

import { liveQuery } from 'dexie'
import { afterEach, expect, test, vi } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { DB } from '../../../src/services/db'
import { createLinearTicketCache } from '../../../src/services/linear/ticket-cache'
import { queryLinearMcpRows, queryLinearTickets } from '../../../src/services/linear/ticket-queries'
import { toLinearTicket } from '../../../src/services/linear/tickets'
import { compareLinearTickets, isLinearTicketTerminal } from '../../../src/services/linear/tickets-sorting'

const caches: ReturnType<typeof createLinearTicketCache>[] = []
function cache(name = crypto.randomUUID()) {
  const result = createLinearTicketCache(new DB(`test-linear-${name}`))
  caches.push(result)
  return result
}
function issue(id: string, time = '2026-01-01T00:00:00Z', status = 'started'): AssignedIssueNode {
  return {
    id,
    identifier: `TASK-${id}`,
    title: `Title ${id}`,
    url: `https://linear.app/acme/issue/TASK-${id}`,
    createdAt: time,
    updatedAt: time,
    state: { id: status, name: status, type: status, color: '#fff', position: 1 },
    assignee: null,
  }
}
afterEach(async () => {
  vi.restoreAllMocks()
  const all = caches.splice(0)
  for (const c of all) c.database.close()
  for (const c of all) await c.database.delete()
})

test('a failed transaction preserves saved tickets and cache metadata', async () => {
  const c = cache()
  await c.replace('viewer', [issue('one')], c.beginSync(), 'now')
  const before = await c.database.linearCacheMeta.get('state')
  vi.spyOn(c.database.linearCacheMeta, 'put').mockRejectedValueOnce(new Error('disk full'))
  await expect(c.replace('viewer', [issue('two')], c.beginSync(), 'later')).rejects.toThrow('disk full')
  expect((await c.database.linearTickets.toArray()).map(row => row.id)).toEqual(['one'])
  expect(await c.database.linearCacheMeta.get('state')).toEqual(before)
})

test('batch updates preserve first-seen order and the last payload for duplicate IDs', async () => {
  const c = cache()
  await c.replace('viewer', [issue('b'), issue('a')], c.beginSync(), 'first')
  await c.replace(
    'viewer',
    [issue('c'), issue('a'), { ...issue('c'), title: 'Last payload' }, issue('d')],
    c.beginSync(),
    'second',
  )
  const rows = await queryLinearMcpRows(c.database, 'viewer', 10, true, null, Infinity)
  expect(rows.map(row => row.id)).toEqual(['b', 'a', 'c', 'd'])
  expect(rows.find(row => row.id === 'c')?.title).toBe('Last payload')
})

test('MCP search applies viewer and closed filters before its output limit', async () => {
  const c = cache()
  const rows = [
    ...Array.from({ length: 140 }, (_, index) => ({
      ...issue(`closed-${index}`, undefined, 'completed'),
      title: 'Needle',
    })),
    ...Array.from({ length: 140 }, (_, index) => issue(`unmatched-${index}`)),
    ...Array.from({ length: 3 }, (_, index) => ({ ...issue(`hit-${index}`), title: 'Needle' })),
  ]
  await c.replace('viewer', rows, c.beginSync(), 'now')
  const foreign = createLinearTicketCache(c.database)
  await foreign.replace('other', [{ ...issue('foreign'), title: 'Needle' }], foreign.beginSync(), 'now')
  expect((await queryLinearMcpRows(c.database, 'viewer', 1, false, 'nEeDlE', Infinity)).map(row => row.id)).toEqual([
    'hit-0',
    'hit-1',
  ])
  expect((await queryLinearMcpRows(c.database, 'viewer', 1, true, 'nEeDlE', Infinity)).map(row => row.id)).toEqual([
    'closed-0',
    'closed-1',
  ])
})

test.each(
  (['alphabetical', 'created', 'custom', 'status', 'updated'] as const).flatMap(sortOrder =>
    [false, true].map(showAll => ({ sortOrder, showAll })),
  ),
)('returns every matching ticket in $sortOrder order with showAll=$showAll', async ({ sortOrder, showAll }) => {
  const c = cache()
  const rows = Array.from({ length: 320 }, (_, i) =>
    issue(
      String(i).padStart(3, '0'),
      i < 220 ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z',
      i % 5 === 0 ? 'completed' : 'started',
    ),
  )
  await c.replace('viewer', rows, c.beginSync(), 'now')
  const foreign = createLinearTicketCache(c.database)
  await foreign.replace('other', [issue('foreign')], foreign.beginSync(), 'now')
  const expected = rows
    .map(toLinearTicket)
    .filter(ticket => showAll || !isLinearTicketTerminal(ticket))
    .sort((a, b) => compareLinearTickets(a, b, { sortOrder }, Date.parse('2026-01-10')))
    .map(row => row.id)
  const result = await queryLinearTickets(c.database, {
    viewerId: 'viewer',
    clockifyScope: null,
    runningEntries: [],
    sortOrder,
    showAll,
    now: new Date('2026-01-10'),
  })
  expect(result.rows.map(row => row.id)).toEqual(expected)
  expect(result.rows).toHaveLength(showAll ? 320 : 256)
})

test('a newer sync aborts an in-progress write transaction', async () => {
  const c = cache()
  await c.replace('viewer', [issue('saved')], c.beginSync(), 'now')
  const original = c.database.linearTickets.bulkPut.bind(c.database.linearTickets)
  let current = 0
  vi.spyOn(c.database.linearTickets, 'bulkPut').mockImplementationOnce(rows =>
    original(rows).then(key => {
      current = c.beginSync()
      return key
    }),
  )
  await expect(c.replace('viewer', [issue('stale')], c.beginSync(), 'old')).rejects.toThrow()
  await c.replace('viewer', [issue('fresh')], current, 'new')
  expect((await c.database.linearTickets.toArray()).map(row => row.id).sort()).toEqual(['fresh', 'saved'])
})

test('live relevance and summaries move with a tracked entry reference in the selected scope', async () => {
  const c = cache()
  await c.replace('viewer', [issue('1'), issue('2')], c.beginSync(), 'now')
  const clockify = createClockifyEntryCache(c.database)
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const entry = (description: string, entryScope = scope) => ({
    id: 'entry',
    ...entryScope,
    description,
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  })
  await clockify.upsert(entry('ref:linear:acme:TASK-1'), scope)
  const other = { userId: 'other', workspaceId: 'workspace' }
  await clockify.upsert(entry('ref:linear:acme:TASK-2', other), other)
  const observed: Array<Array<[string, number | null]>> = []
  const subscription = liveQuery(() =>
    queryLinearTickets(c.database, {
      viewerId: 'viewer',
      clockifyScope: scope,
      runningEntries: [],
      sortOrder: 'custom',
      showAll: true,
      now: new Date('2026-01-02'),
    }),
  ).subscribe(result => observed.push(result.rows.map(row => [row.id, row.totalTrackedSeconds])))
  try {
    await vi.waitFor(() => expect(observed).toContainEqual(expect.arrayContaining([['1', 3600]])))
    await clockify.upsert(entry('ref:linear:acme:TASK-2'), scope)
    await vi.waitFor(() => expect(observed).toContainEqual(expect.arrayContaining([['2', 3600]])))
    const latest = observed[observed.length - 1]
    expect(latest.find(row => row[0] === '1')?.[1] ?? 0).toBe(0)
  } finally {
    subscription.unsubscribe()
  }
})

test('consecutive Clockify repairs finish while live Linear totals recompute', async () => {
  const c = cache()
  await c.replace('viewer', [issue('1')], c.beginSync(), 'now')
  const clockify = createClockifyEntryCache(c.database)
  const scope = { userId: 'user', workspaceId: 'workspace' }
  const entries = Array.from({ length: 30 }, (_, index) => ({
    id: `entry-${index}`,
    ...scope,
    description: 'ref:linear:acme:TASK-1',
    timeInterval: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' },
  }))
  await clockify.reconcile(
    scope,
    entries,
    '2026-01-01T00:00:00Z',
    '2026-01-03T00:00:00Z',
    'now',
    clockify.beginSync(),
    await clockify.getRevision(),
  )
  const observed: Array<{ total: number | null; last: string | null }> = []
  const errors: unknown[] = []
  const subscription = liveQuery(() =>
    queryLinearTickets(c.database, {
      viewerId: 'viewer',
      clockifyScope: scope,
      runningEntries: [],
      sortOrder: 'custom',
      showAll: true,
      now: new Date('2026-01-03'),
    }),
  ).subscribe({
    next: result => observed.push({ total: result.rows[0].totalTrackedSeconds, last: result.rows[0].lastTrackedAt }),
    error: error => errors.push(error),
  })
  try {
    for (const entry of entries) {
      await clockify.upsert(
        { ...entry, timeInterval: { start: '2026-01-02T10:00:00Z', end: '2026-01-02T11:00:00Z' } },
        scope,
      )
    }
    await vi.waitFor(() =>
      expect(observed[observed.length - 1]).toEqual({ total: 108000, last: '2026-01-02T11:00:00Z' }),
    )
    expect(errors).toEqual([])
  } finally {
    subscription.unsubscribe()
  }
})
