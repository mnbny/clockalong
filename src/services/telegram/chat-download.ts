import { telegramDownload } from '../tauri/telegram-download-client'
import { TelegramFileError } from './chat-files'

const saveFailed = () => {
  throw new TelegramFileError('save-failed')
}

export async function saveToDownloads(
  fileName: string,
  expectedBytes: number,
  signal: AbortSignal,
  download: (sink: WritableStream<Uint8Array>) => Promise<void>,
) {
  let handle: string | undefined
  let cancellation: Promise<void> | undefined
  let closed = false
  let saved = false
  const cancel = () => {
    if (!handle || saved) return Promise.resolve()
    return (cancellation ??= telegramDownload.cancel(handle).catch(() => {}))
  }
  const check = () => {
    if (signal.aborted) throw new TelegramFileError('aborted')
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    check()
    handle = await telegramDownload.begin(fileName, expectedBytes).catch(saveFailed)
    check()
    const sink = new WritableStream<Uint8Array>({
      async write(bytes) {
        check()
        await telegramDownload.append(handle!, bytes).catch(saveFailed)
        check()
      },
      close() {
        closed = true
      },
      abort: cancel,
    })
    await download(sink)
    check()
    if (!closed) throw new TelegramFileError('save-failed')
    const result = await telegramDownload.finish(handle).catch(saveFailed)
    saved = true
    return result
  } catch (error) {
    const cleanup = cancel()
    if (!signal.aborted) await cleanup
    check()
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}
