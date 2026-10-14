import type { TelegramChat } from './chat'

import { telegramMedia } from '../tauri/telegram-media-client'
import { TelegramFileError } from './chat-files'

export async function stageTelegramMedia(
  chat: TelegramChat,
  messageId: number,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
) {
  signal = AbortSignal.any([signal, chat.signal])
  let handle: string | undefined
  let released: Promise<void> | undefined
  let closed = false
  const release = () => (handle ? (released ??= telegramMedia.release(handle).catch(() => {})) : Promise.resolve())
  const check = () => {
    if (signal.aborted) throw new TelegramFileError('aborted')
  }
  const failed = () => {
    throw new TelegramFileError('media-failed')
  }
  signal.addEventListener('abort', release, { once: true })
  try {
    check()
    const attachment = chat.cache.findMessage(messageId)?.view.attachment
    if (!attachment?.downloadable || !attachment.mime || !attachment.size) throw new TelegramFileError('unavailable')
    handle = await telegramMedia.begin(attachment.mime, attachment.size).catch(failed)
    check()
    if (chat.cache.findMessage(messageId)?.view.attachment?.id !== attachment.id)
      throw new TelegramFileError('unavailable')
    const sink = new WritableStream<Uint8Array>({
      async write(bytes) {
        check()
        await telegramMedia.append(handle!, bytes).catch(failed)
        check()
      },
      close() {
        closed = true
      },
      abort: release,
    })
    await chat.download(messageId, { sink, signal, onProgress })
    check()
    if (!closed) failed()
    const url = await telegramMedia.finish(handle).catch(failed)
    check()
    return { url, release }
  } catch (error) {
    const cleanup = release()
    if (!signal.aborted) await cleanup
    check()
    throw error
  } finally {
    signal.removeEventListener('abort', release)
  }
}
