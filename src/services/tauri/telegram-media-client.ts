import { convertFileSrc, invoke } from '@tauri-apps/api/core'

export const telegramMedia = {
  begin: (mime: string, expectedBytes: number) => invoke<string>('telegram_media_begin', { mime, expectedBytes }),
  append: (handle: string, bytes: Uint8Array) =>
    invoke<void>('telegram_media_append', bytes, { headers: { 'x-telegram-media-handle': handle } }),
  finish: async (handle: string) => {
    const { path } = await invoke<{ path: string }>('telegram_media_finish', { handle })
    return convertFileSrc(path)
  },
  release: (handle: string) => invoke<void>('telegram_media_release', { handle }),
}
