import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { telegramImageCache } from '../../../src/services/tauri/telegram-image-cache-client'
import { TelegramChatImages } from '../../../src/services/telegram/chat-images'
import { deferred } from './fixtures'

const image = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])
const blob = new Blob([image], { type: 'image/jpeg' })
const group = '1:basic:123'
const signal = () => new AbortController().signal

beforeEach(() => {
  vi.spyOn(telegramImageCache, 'scope').mockResolvedValue('token')
  vi.spyOn(telegramImageCache, 'read').mockResolvedValue(new Uint8Array())
  vi.spyOn(telegramImageCache, 'write').mockResolvedValue()
})
afterEach(() => vi.restoreAllMocks())

test('a new runtime reuses disk images while a new image identity downloads again', async () => {
  const disk = new Map<string, Uint8Array<ArrayBuffer>>()
  vi.mocked(telegramImageCache.read).mockImplementation(async (_token, key) => disk.get(key) ?? new Uint8Array())
  vi.mocked(telegramImageCache.write).mockImplementation(async (_token, key, bytes) => {
    disk.set(key, new Uint8Array(bytes))
  })
  const download = vi.fn(async () => blob)
  await new TelegramChatImages(group).load('avatar:1:9:small', download, signal())
  const restarted = new TelegramChatImages(group)
  const cached = await restarted.load('avatar:1:9:small', download, signal())
  expect(new Uint8Array(await cached!.arrayBuffer())).toEqual(image)
  expect(download).toHaveBeenCalledTimes(1)
  await restarted.load('avatar:1:10:small', download, signal())
  expect(download).toHaveBeenCalledTimes(2)
  expect(telegramImageCache.scope).toHaveBeenCalledTimes(2)
})

test('disk failures and invalid cached bytes fall back to normal image downloads', async () => {
  const download = vi.fn(async () => blob)
  vi.mocked(telegramImageCache.read)
    .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    .mockRejectedValueOnce(new Error('disk'))
  vi.mocked(telegramImageCache.write).mockRejectedValue(new Error('full'))
  const cache = new TelegramChatImages(group)
  expect(await cache.load('one', download, signal())).toBe(blob)
  expect(await cache.load('two', download, signal())).toBe(blob)
  vi.mocked(telegramImageCache.scope).mockRejectedValue(new Error('unavailable'))
  expect(await new TelegramChatImages(group).load('three', download, signal())).toBe(blob)
  expect(download).toHaveBeenCalledTimes(3)
})

test.each(['image/jpeg', 'image/gif', 'image/webp'])(
  'full %s images survive a runtime restart above the thumbnail size limit',
  async mime => {
    const bytes = new Uint8Array(512 * 1024 + 1)
    bytes.set(
      mime === 'image/jpeg' ? image : new TextEncoder().encode(mime === 'image/gif' ? 'GIF89a' : 'RIFF0000WEBPVP8X'),
    )
    if (mime === 'image/webp') bytes[20] = 2
    const original = new Blob([bytes], { type: mime })
    const disk = new Map<string, Uint8Array<ArrayBuffer>>()
    vi.mocked(telegramImageCache.read).mockImplementation(async (_token, key) => disk.get(key) ?? new Uint8Array())
    vi.mocked(telegramImageCache.write).mockImplementation(async (_token, key, data) => {
      disk.set(key, new Uint8Array(data))
    })
    const download = vi.fn(async () => original)
    const key = 'notification-image:photo:1'
    await new TelegramChatImages(group).load(key, download, signal())
    const cached = await new TelegramChatImages(group).load(key, download, signal())
    expect(cached?.size).toBe(bytes.length)
    expect(cached?.type).toBe(mime)
    expect(download).toHaveBeenCalledTimes(1)
    expect(new Uint8Array(await cached!.arrayBuffer())).toEqual(bytes)
    await new TelegramChatImages(group).load('notification-preview:photo:1', download, signal())
    expect(disk.has('notification-preview:photo:1')).toBe(false)
  },
)

test('a scope cancelled during a disk read cannot return or download an image', async () => {
  const reading = deferred()
  const wait = deferred<Uint8Array<ArrayBuffer>>()
  vi.mocked(telegramImageCache.read).mockImplementation(() => {
    reading.resolve()
    return wait.promise
  })
  const controller = new AbortController()
  const download = vi.fn(async () => blob)
  const result = new TelegramChatImages(group).load('avatar', download, controller.signal)
  await reading.promise
  controller.abort()
  wait.resolve(image)
  await expect(result).rejects.toMatchObject({ category: 'aborted' })
  expect(download).not.toHaveBeenCalled()
})

test('a late download after cancellation is never written to disk', async () => {
  const downloading = deferred()
  const wait = deferred<Blob>()
  const controller = new AbortController()
  const result = new TelegramChatImages(group).load(
    'preview',
    () => {
      downloading.resolve()
      return wait.promise
    },
    controller.signal,
  )
  await downloading.promise
  controller.abort()
  wait.resolve(blob)
  await expect(result).rejects.toMatchObject({ category: 'aborted' })
  expect(telegramImageCache.write).not.toHaveBeenCalled()
})

test('download failures still propagate and cannot become disk entries', async () => {
  const failure = new Error('download failed')
  await expect(
    new TelegramChatImages(group).load(
      'preview',
      async () => {
        throw failure
      },
      signal(),
    ),
  ).rejects.toBe(failure)
  expect(telegramImageCache.write).not.toHaveBeenCalled()
})
