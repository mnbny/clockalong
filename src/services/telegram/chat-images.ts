import { telegramImageCache } from '../tauri/telegram-image-cache-client'
import { photoMime, TelegramFileError } from './chat-files'

export class TelegramChatImages {
  private token: Promise<string | null> | undefined

  constructor(private readonly group: string) {}

  async load(key: string, download: () => Promise<Blob | null>, signal: AbortSignal) {
    const check = () => {
      if (signal.aborted) throw new TelegramFileError('aborted')
    }
    check()
    const token = await (this.token ??= telegramImageCache.scope(this.group).catch(() => null))
    check()
    if (token) {
      const bytes = await telegramImageCache.read(token, key).catch(() => null)
      check()
      const mime = bytes && photoMime(bytes)
      if (bytes && mime) return new Blob([bytes], { type: mime })
    }
    const blob = await download()
    check()
    if (token && blob && blob.size > 0 && blob.size <= 512 * 1024) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      check()
      if (photoMime(bytes)) await telegramImageCache.write(token, key, bytes).catch(() => {})
      check()
    }
    return blob
  }
}
