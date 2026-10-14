import { invoke } from '@tauri-apps/api/core'

export const telegramDownload = {
  begin: (fileName: string, expectedBytes: number) =>
    invoke<string>('telegram_download_begin', { fileName, expectedBytes }),
  append: (handle: string, bytes: Uint8Array) =>
    invoke<void>('telegram_download_append', bytes, { headers: { 'x-telegram-download-handle': handle } }),
  finish: (handle: string) => invoke<{ fileName: string }>('telegram_download_finish', { handle }),
  cancel: (handle: string) => invoke<void>('telegram_download_cancel', { handle }),
}
