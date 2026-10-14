import type { TelegramChat } from '../../../src/services/telegram/chat'

import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { telegramMedia } from '../../../src/services/tauri/telegram-media-client'
import { stageTelegramMedia } from '../../../src/services/telegram/chat-media'
import { deferred } from './fixtures'

const scope = new AbortController()
const chat = (download: TelegramChat['download']) =>
  ({
    signal: scope.signal,
    cache: {
      findMessage: () => ({ view: { attachment: { id: 'media', downloadable: true, mime: 'image/png', size: 3 } } }),
    },
    download,
  }) as unknown as TelegramChat
const write: TelegramChat['download'] = async (_id, { sink }) => {
  const writer = sink.getWriter()
  await writer.write(new Uint8Array([1, 2, 3]))
  await writer.close()
  writer.releaseLock()
}
beforeEach(() => {
  vi.spyOn(telegramMedia, 'begin').mockResolvedValue('handle')
  vi.spyOn(telegramMedia, 'append').mockResolvedValue()
  vi.spyOn(telegramMedia, 'finish').mockResolvedValue('asset://media')
  vi.spyOn(telegramMedia, 'release').mockResolvedValue()
})
afterEach(() => vi.restoreAllMocks())

test('full media streams with backpressure and remains owned by the viewer until release', async () => {
  const wait = deferred()
  const started = deferred()
  vi.mocked(telegramMedia.append).mockImplementation(async () => {
    started.resolve()
    await wait.promise
  })
  const staging = stageTelegramMedia(chat(write), 7, new AbortController().signal, () => {})
  await started.promise
  expect(telegramMedia.finish).not.toHaveBeenCalled()
  wait.resolve()
  const media = await staging
  expect(media.url).toBe('asset://media')
  expect(telegramMedia.release).not.toHaveBeenCalled()
  await media.release()
  await media.release()
  expect(telegramMedia.release).toHaveBeenCalledExactlyOnceWith('handle')
})
test('closing during begin releases the late handle without downloading', async () => {
  const wait = deferred<string>()
  vi.mocked(telegramMedia.begin).mockReturnValue(wait.promise)
  const controller = new AbortController()
  const download = vi.fn(write)
  const staging = stageTelegramMedia(chat(download), 7, controller.signal, () => {})
  controller.abort()
  wait.resolve('late')
  await expect(staging).rejects.toMatchObject({ category: 'aborted' })
  expect(download).not.toHaveBeenCalled()
  expect(telegramMedia.release).toHaveBeenCalledWith('late')
})
test('closing during finalization cannot publish a late viewer URL', async () => {
  const wait = deferred<string>()
  const finishing = deferred()
  vi.mocked(telegramMedia.finish).mockImplementation(() => {
    finishing.resolve()
    return wait.promise
  })
  const controller = new AbortController()
  const staging = stageTelegramMedia(chat(write), 7, controller.signal, () => {})
  await finishing.promise
  controller.abort()
  wait.resolve('asset://late')
  await expect(staging).rejects.toMatchObject({ category: 'aborted' })
  expect(telegramMedia.release).toHaveBeenCalledExactlyOnceWith('handle')
})
test('native errors stay fixed and partial staging is released', async () => {
  vi.mocked(telegramMedia.append).mockRejectedValue(new Error('/private/secret/path'))
  await expect(stageTelegramMedia(chat(write), 7, new AbortController().signal, () => {})).rejects.toMatchObject({
    category: 'media-failed',
    message: 'Could not open this Telegram media. Try downloading it instead.',
  })
  expect(telegramMedia.release).toHaveBeenCalledWith('handle')
})
