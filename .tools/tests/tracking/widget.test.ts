// @vitest-environment happy-dom
import type { TrackedTimer } from '../../../src/services/tracking/store'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'

import { ConcurrentTimers } from '../../../src/components/ConcurrentTimers'
import { queryClient, queryKeys } from '../../../src/lib/query-client'
import { db } from '../../../src/services/db'
import * as coordinator from '../../../src/services/tracking/coordinator'

test('only internal rows appear, failed saves can retry, and dismissal confirms before discarding local time', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const client = new QueryClient()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  queryClient.setQueryData(queryKeys.clockify.loggedUser, { id: 'user' })
  const timer: TrackedTimer = {
    timerId: 'one',
    userId: 'user',
    workspaceId: 'workspace',
    projectName: 'Project',
    callerId: 'first-worktree',
    source: 'quick_timer',
    sourceId: 'task',
    mode: 'internal',
    body: { description: 'Same task', start: '2026-01-01T00:00:00Z' },
    entryId: null,
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: null,
    state: 'active',
    uncertain: false,
    error: null,
  }
  let finishSave!: () => void
  const refresh = vi.spyOn(coordinator, 'refreshStoppedTimer').mockResolvedValue()
  const stop = vi
    .spyOn(coordinator, 'stopTrackedTimer')
    .mockImplementation(async timerId => {
      await db.trackedTimers.delete(timerId)
      return { mode: 'internal', userId: 'user', workspaceId: 'workspace' }
    })
    .mockImplementationOnce(async timerId => {
      await db.trackedTimers.update(timerId, {
        endedAt: '2026-01-01T00:01:00Z',
        state: 'saving',
      })
      await new Promise<void>(resolve => {
        finishSave = resolve
      })
      await db.trackedTimers.update(timerId, {
        state: 'failed',
        uncertain: true,
        error: 'Save is unconfirmed.',
      })
      throw new Error('Save is unconfirmed.')
    })
  try {
    await db.trackedTimers.bulkPut([
      timer,
      { ...timer, timerId: 'two', callerId: 'second-worktree' },
      { ...timer, timerId: 'phantom', mode: 'clockify', state: 'failed', entryId: 'deleted' },
    ])
    await act(async () =>
      root.render(createElement(QueryClientProvider, { client }, createElement(ConcurrentTimers, { userId: 'user' }))),
    )
    await vi.waitFor(() => expect(container.querySelectorAll('li')).toHaveLength(2))
    expect(container.querySelector('[data-timer-id="phantom"]')).toBeNull()
    const second = container.querySelector<HTMLLIElement>('[data-timer-id="two"]')!
    await act(async () => second.querySelector<HTMLButtonElement>('button')!.click())
    expect(stop.mock.calls[0]).toEqual(['two', false])
    await vi.waitFor(() => expect(container.querySelector('[data-timer-id="two"]')).toBeNull())
    await vi.waitFor(() => expect(finishSave).toBeDefined())
    await act(async () => finishSave())
    await vi.waitFor(() => expect(container.querySelector('[data-timer-id="two"]')).not.toBeNull())
    const failed = container.querySelector<HTMLLIElement>('[data-timer-id="two"]')!
    expect(failed.textContent).toContain('0:01:00')
    expect(failed.textContent).not.toContain('Save is unconfirmed')
    expect(failed.textContent).not.toContain(new Date(timer.startedAt).toLocaleString())
    expect(failed.querySelectorAll('button')).toHaveLength(2)
    const retry = failed.querySelector<HTMLButtonElement>('[aria-label="Retry saving Same task"]')!
    expect(retry.textContent).toBe('')
    await act(async () => retry.click())
    expect(stop.mock.calls[1]).toEqual(['two', true])
    await vi.waitFor(() => expect(container.querySelector('[data-timer-id="two"]')).toBeNull())
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(refresh).toHaveBeenCalledWith(
      { mode: 'internal', userId: 'user', workspaceId: 'workspace' },
      expect.any(Number),
    )
    expect(container.querySelector('[data-timer-id="one"]')?.textContent).toContain('first-worktree')
    await act(async () => {
      await db.trackedTimers.put({
        ...timer,
        timerId: 'discard',
        state: 'failed',
        endedAt: '2026-01-01T00:01:00Z',
        uncertain: true,
      })
    })
    await vi.waitFor(() => expect(container.querySelector('[data-timer-id="discard"]')).not.toBeNull())
    const discarded = container.querySelector<HTMLLIElement>('[data-timer-id="discard"]')!
    const dismiss = discarded.querySelector<HTMLButtonElement>('[aria-label="Dismiss Same task"]')!
    await act(async () => dismiss.click())
    const dialog = discarded.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(dialog.textContent).toContain('may already be in Clockify')
    expect(await db.trackedTimers.get('discard')).toBeDefined()
    await act(async () =>
      [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Cancel')!.click(),
    )
    expect(discarded.querySelector('dialog')).toBeNull()
    await act(async () => dismiss.click())
    await act(async () => discarded.querySelector<HTMLButtonElement>('dialog button.btn-error')!.click())
    await vi.waitFor(() => expect(container.querySelector('[data-timer-id="discard"]')).toBeNull())
    expect(await db.trackedTimers.get('discard')).toBeUndefined()
    expect(await db.trackedTimers.get('one')).toBeDefined()
    expect(await db.trackedTimers.get('phantom')).toBeDefined()
    expect(stop).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    client.clear()
    queryClient.clear()
    vi.restoreAllMocks()
    await db.trackedTimers.clear()
  }
})
