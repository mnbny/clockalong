import { telegramImageCache } from '../tauri/telegram-image-cache-client'
import { maxTelegramImageBytes } from './attachment-image'
import { imageMime, photoMime, TelegramFileError } from './chat-files'

export class TelegramChatImages {
  private token: Promise<string | null> | undefined

  constructor(private readonly group: string) {}

  async read(key: string, signal: AbortSignal) {
    const check = () => {
      if (signal.aborted) throw new TelegramFileError('aborted')
    }
    check()
    const token = await (this.token ??= telegramImageCache.scope(this.group).catch(() => null))
    check()
    if (!token) return null
    const bytes = await telegramImageCache.read(token, key).catch(() => null)
    check()
    const full = key.startsWith('notification-image:')
    const mime = bytes && (full ? imageMime(bytes) : photoMime(bytes))
    return bytes && mime ? new Blob([bytes], { type: mime }) : null
  }

  async load(key: string, download: () => Promise<Blob | null>, signal: AbortSignal) {
    const check = () => {
      if (signal.aborted) throw new TelegramFileError('aborted')
    }
    check()
    const cached = await this.read(key, signal)
    if (cached) return cached
    const token = await this.token
    const blob = await download()
    check()
    const full = key.startsWith('notification-image:')
    if (token && blob && blob.size > 0 && blob.size <= (full ? maxTelegramImageBytes : 512 * 1024)) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      check()
      if (full ? imageMime(bytes) : photoMime(bytes)) await telegramImageCache.write(token, key, bytes).catch(() => {})
      check()
    }
    return blob
  }
}
