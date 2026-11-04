// @vitest-environment happy-dom
import type { Root } from 'react-dom/client'

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useTelegramNotificationSnooze } from '../../../src/hooks/useTelegramNotificationSnooze'
import { storage } from '../../../src/services/storage/config'
import { deferred } from './fixtures'

vi.mock('../../../src/services/storage/config', () => ({
  storage: {
    config: { telegramNotificationsSnoozedUntil: { default: 0 } },
    get: vi.fn(),
    set: vi.fn(),
    onKeyChange: vi.fn(),
  },
}))

let root: Root | undefined
let host: HTMLDivElement
let current: ReturnType<typeof useTelegramNotificationSnooze>
let stored = 0
const listeners = new Set<(value: number) => void>()

function Harness() {
  current = useTelegramNotificationSnooze()
  return createElement('span', null, current.visible ? 'visible' : 'hidden')
}

async function mount() {
  root = createRoot(host)
  await act(async () => root!.render(createElement(Harness)))
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
  stored = 0
  vi.mocked(storage.get).mockImplementation(async () => stored)
  vi.mocked(storage.set).mockImplementation(async (_key, value) => {
    stored = value as number
    listeners.forEach(listener => listener(stored))
  })
  vi.mocked(storage.onKeyChange).mockImplementation(async (_key, listener) => {
    const receive = listener as (value: number) => void
    listeners.add(receive)
    return () => {
      listeners.delete(receive)
    }
  })
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  host.remove()
  listeners.clear()
  vi.clearAllMocks()
  vi.useRealTimers()
})

test('snooze persists its deadline and a remount waits only the remaining time', async () => {
  await mount()
  expect(current!.visible).toBe(true)
  const deadline = Date.now() + 15 * 60_000
  await act(async () => current!.snooze())
  expect(stored).toBe(deadline)
  expect(current!.visible).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 60_000)
  })
  await act(async () => root!.unmount())
  await mount()
  expect(current!.visible).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1)
  })
  expect(current!.visible).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(current!.visible).toBe(true)
})

test('the feed stays hidden while storage loads and wakes when focus returns after sleep', async () => {
  const loading = deferred<number>()
  stored = Date.now() + 15 * 60_000
  vi.mocked(storage.get).mockReturnValueOnce(loading.promise)
  await mount()
  expect(current!.visible).toBe(false)
  await act(async () => {
    loading.resolve(stored)
    await loading.promise
  })
  expect(current!.visible).toBe(false)
  vi.setSystemTime(stored + 1)
  await act(async () => window.dispatchEvent(new Event('focus')))
  expect(current!.visible).toBe(true)
})

test('an updated deadline cancels the old wake-up timer', async () => {
  await mount()
  await act(async () => current!.snooze())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 60_000)
  })
  await act(async () => storage.set('telegramNotificationsSnoozedUntil', Date.now() + 15 * 60_000))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5 * 60_000)
  })
  expect(current!.visible).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 60_000)
  })
  expect(current!.visible).toBe(true)
})
