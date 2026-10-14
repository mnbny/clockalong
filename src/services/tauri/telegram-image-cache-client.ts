import { invoke } from '@tauri-apps/api/core'

export const telegramImageCache = {
  scope: (group: string) => invoke<string>('telegram_image_cache_scope', { group }),
  read: async (token: string, key: string) => {
    const bytes = await invoke<ArrayBuffer | number[]>('telegram_image_cache_read', { token, key })
    return new Uint8Array(bytes)
  },
  write: (token: string, key: string, bytes: Uint8Array) =>
    invoke<void>('telegram_image_cache_write', bytes, {
      headers: { 'x-telegram-image-token': token, 'x-telegram-image-key': key },
    }),
}
