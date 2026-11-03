// @vitest-environment happy-dom
import type { TelegramNotification } from '../../../src/services/telegram/notification-store'
import type { Root } from 'react-dom/client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'

import { TelegramNotificationImage } from '../../../src/components/TelegramNotificationImage'
import { telegramImageCache } from '../../../src/services/tauri/telegram-image-cache-client'
import { deferred } from './fixtures'

const { chat } = vi.hoisted(() => ({
  chat: {
    scope: '1:supergroup:123:1',
    notificationScope: '1:supergroup:123',
    isReady: true,
    notificationImage: vi.fn(),
  },
}))
vi.mock('../../../src/services/telegram/session-provider', () => ({ useTelegram: () => ({ chat }) }))
vi.mock('../../../src/components/ImageLightbox', () => ({
  default: ({ src, onClose }: { src?: string; onClose: () => void }) =>
    createElement('button', { 'aria-label': 'Close viewer', onClick: onClose, 'data-image': src }, 'Close'),
}))

let root: Root | undefined
let host: HTMLDivElement | undefined
let client: QueryClient | undefined
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  host?.remove()
  client?.clear()
  vi.restoreAllMocks()
  chat.notificationImage.mockReset()
  chat.isReady = true
})

async function mount(spoiler = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let id = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:image-${++id}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const row = {
    scope: chat.notificationScope,
    id: 7,
    collectedAt: 0,
    clearedAt: 0,
    deleted: false,
    message: {
      id: 7,
      topicId: 1,
      date: 0,
      text: '',
      entities: [],
      outgoing: false,
      mentioned: false,
      protected: false,
      replyOutsideGroup: false,
      sender: null,
      attachment: { kind: 'photo', id: '99', mime: 'image/jpeg', size: 100, downloadable: true, spoiler },
    },
  } satisfies TelegramNotification
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(QueryClientProvider, { client: client! }, createElement(TelegramNotificationImage, { row })),
    ),
  )
  return host.querySelector('button')!
}

test('hover preloads once and clicking shares the pending full-image request', async () => {
  const full = deferred<Blob>()
  chat.notificationImage.mockImplementation((_message, original) => (original ? full.promise : Promise.resolve(null)))
  const button = await mount()
  expect(chat.notificationImage.mock.calls.every(call => call[1] === false)).toBe(true)
  await act(async () => button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
  expect(chat.notificationImage.mock.calls.filter(call => call[1])).toHaveLength(1)
  await act(async () => button.click())
  await act(async () => {
    full.resolve(new Blob(['image']))
    await full.promise
  })
  await vi.waitFor(() => expect(host!.querySelector('[data-image]')).not.toBeNull())
  expect(chat.notificationImage.mock.calls.filter(call => call[1])).toHaveLength(1)
  const url = host!.querySelector('[data-image]')!.getAttribute('data-image')!
  await act(async () => (host!.querySelector('[aria-label="Close viewer"]') as HTMLButtonElement).click())
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
})

test('an unrevealed spoiler does not fetch a thumbnail or preload on hover and focus', async () => {
  chat.notificationImage.mockResolvedValue(null)
  const button = await mount(true)
  await act(async () => {
    button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
    button.focus()
  })
  expect(chat.notificationImage).not.toHaveBeenCalled()
  await act(async () => button.click())
  await vi.waitFor(() => expect(chat.notificationImage.mock.calls.some(call => call[1])).toBe(true))
})

test('cached thumbnails render while Telegram is still reconnecting', async () => {
  chat.isReady = false
  vi.spyOn(telegramImageCache, 'scope').mockResolvedValue('token')
  vi.spyOn(telegramImageCache, 'read').mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 1]))
  const button = await mount()
  await vi.waitFor(() => expect(button.querySelector('img')?.getAttribute('src')).toContain('blob:'))
  expect(chat.notificationImage).not.toHaveBeenCalled()
})
