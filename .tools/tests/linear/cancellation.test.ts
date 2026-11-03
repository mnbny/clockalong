// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { act, createElement, useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { useDexieQuery } from '../../../src/hooks/useDexieQuery'
import { DB } from '../../../src/services/db'
import { createLinearTicketCache } from '../../../src/services/linear/ticket-cache'
import { queryLinearPage } from '../../../src/services/linear/ticket-queries'

let root: Root | undefined
let container: HTMLDivElement | undefined
let database: DB | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  container = undefined
  vi.restoreAllMocks()
  if (database) {
    database.close()
    await database.delete()
    database = undefined
  }
})

test('replacing a live query cancels its in-flight scan and the replacement and retry work', async () => {
  database = new DB(`linear-cancel-${crypto.randomUUID()}`)
  const db = database
  const cache = createLinearTicketCache(db)
  const tickets = Array.from({ length: 3000 }, (_, i) => ({
    id: String(i),
    identifier: `TASK-${i}`,
    title: `Ticket ${i}`,
    url: `https://linear.app/team/issue/TASK-${i}`,
    createdAt: '2026-01-01',
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    assignee: null,
    state: { id: 'open', name: 'Open', type: 'started', position: 0, color: '#fff' },
  }))
  await cache.replace('viewer', tickets, cache.beginSync(), 'now')
  let changeSort!: () => void
  let firstSignal: AbortSignal | undefined
  let latestSignal: AbortSignal | undefined
  let scans = 0
  let dateScans = 0
  function Harness() {
    const [sort, setSort] = useState<'custom' | 'updated'>('custom')
    changeSort = () => setSort('updated')
    const read = useCallback(
      (signal: AbortSignal) => {
        if (sort === 'custom') firstSignal = signal
        latestSignal = signal
        return queryLinearPage(db, {
          viewerId: 'viewer',
          clockifyScope: null,
          runningEntries: [],
          sortOrder: sort,
          showAll: true,
          now: new Date('2026-01-10'),
          limit: 50,
          signal,
        })
      },
      [sort],
    )
    const result = useDexieQuery(read)
    return createElement(
      'div',
      null,
      result.data?.rows[0]?.title ?? 'loading',
      createElement('button', { onClick: result.retry }, 'Retry'),
    )
  }
  const original = db.linearTickets.where.bind(db.linearTickets)
  vi.spyOn(db.linearTickets, 'where').mockImplementation(index => {
    if (String(index) === '[viewerId+sequence+id]') {
      scans++
      if (scans === 1) queueMicrotask(() => flushSync(() => changeSort()))
    }
    if (String(index) === '[viewerId+updatedAtMs+id]') dateScans++
    return original(index)
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(createElement(Harness)))
  await vi.waitFor(() => expect(container!.textContent).toContain('Ticket 2999'))
  expect(firstSignal?.aborted).toBe(true)
  expect(scans).toBeLessThan(25)
  const beforeRetry = dateScans
  await act(async () => container!.querySelector('button')!.click())
  await vi.waitFor(() => expect(dateScans).toBeGreaterThan(beforeRetry))
  await vi.waitFor(() => expect(container!.textContent).toContain('Ticket 2999'))
  await act(async () => root?.unmount())
  root = undefined
  expect(latestSignal?.aborted).toBe(true)
})
