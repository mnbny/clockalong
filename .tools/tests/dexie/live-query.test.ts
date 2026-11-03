// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { act, createElement, StrictMode, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { useDexieQuery } from '../../../src/hooks/useDexieQuery'
import { DB, db as appDb } from '../../../src/services/db'

let root: Root | undefined
let container: HTMLDivElement | undefined
let database: DB | undefined
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  container?.remove()
  if (database) await database.delete()
  database = undefined
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

test('filter changes keep the previous result until the live replacement arrives', async () => {
  database = new DB(`live-query-${crypto.randomUUID()}`)
  const db = database
  await db.githubCacheMeta.bulkPut([
    { key: 'first', revision: 1 },
    { key: 'second', revision: 2 },
  ])
  const gate = deferred()
  function Harness({ filter }: { filter: string }) {
    const query = useCallback(async () => {
      if (filter === 'second') await Promise.resolve(gate.promise)
      return (await db.githubCacheMeta.get(filter))?.revision
    }, [filter])
    const result = useDexieQuery(query)
    return createElement('div', null, result.data ?? 'loading')
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  root = createRoot(container)
  const render = (filter: string) =>
    act(async () => root?.render(createElement(StrictMode, null, createElement(Harness, { filter }))))
  await render('first')
  await vi.waitFor(() => expect(container!.textContent).toBe('1'))
  await render('second')
  expect(container.textContent).toBe('1')
  await act(async () => gate.resolve())
  await vi.waitFor(() => expect(container!.textContent).toBe('2'))
  await act(async () => {
    await db.githubCacheMeta.put({ key: 'second', revision: 3 })
  })
  await vi.waitFor(() => expect(container!.textContent).toBe('3'))
})

test('scope changes hide previous rows immediately and ignore an abandoned query result', async () => {
  const filterGate = deferred()
  const accountGate = deferred()
  let oldSignal: AbortSignal | undefined
  let currentSignal: AbortSignal | undefined
  function Harness({ scope, filter }: { scope: string; filter: string }) {
    const query = useCallback(
      async (signal: AbortSignal) => {
        currentSignal = signal
        if (filter === 'pending') {
          oldSignal = signal
          await Promise.resolve(filterGate.promise)
        }
        if (scope === 'other') await Promise.resolve(accountGate.promise)
        return `${scope}/${filter}`
      },
      [scope, filter],
    )
    const result = useDexieQuery(query, scope)
    return createElement('div', null, result.data ?? 'loading')
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  root = createRoot(container)
  const render = (scope: string, filter: string) =>
    act(async () => root?.render(createElement(Harness, { scope, filter })))
  await render('first', 'initial')
  await vi.waitFor(() => expect(container!.textContent).toBe('first/initial'))
  await render('first', 'pending')
  await vi.waitFor(() => expect(oldSignal).toBeDefined())
  expect(container.textContent).toBe('first/initial')
  await render('other', 'new')
  expect(container.textContent).toBe('loading')
  expect(oldSignal!.aborted).toBe(true)
  await act(async () => filterGate.resolve())
  expect(container.textContent).toBe('loading')
  await act(async () => accountGate.resolve())
  await vi.waitFor(() => expect(container!.textContent).toBe('other/new'))
  await act(async () => root?.unmount())
  root = undefined
  expect(currentSignal!.aborted).toBe(true)
})

test('retry reopens after a failed upgrade, reports another failure and preserves saved rows', async () => {
  database = appDb
  await appDb.githubCacheMeta.put({ key: 'saved', revision: 7 })
  appDb.close({ disableAutoOpen: false })
  let upgrades = 0
  appDb
    .version(appDb.verno + 1)
    .stores({ githubCacheMeta: 'key,revision' })
    .upgrade(() => {
      if (++upgrades < 3) throw new Error('Temporary upgrade failure')
    })
  function Harness() {
    const query = useCallback(async () => (await appDb.githubCacheMeta.get('saved'))?.revision, [])
    const result = useDexieQuery(query)
    return createElement('button', { onClick: result.retry }, result.error ? 'Failed' : (result.data ?? 'Loading'))
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root?.render(createElement(Harness)))
  await vi.waitFor(() => expect(container!.textContent).toBe('Failed'))
  expect(upgrades).toBe(1)
  await act(async () => container!.querySelector('button')!.click())
  await vi.waitFor(() => expect(upgrades).toBe(2))
  await vi.waitFor(() => expect(container!.textContent).toBe('Failed'))
  await act(async () => container!.querySelector('button')!.click())
  await vi.waitFor(() => expect(container!.textContent).toBe('7'))
  expect(upgrades).toBe(3)
})
