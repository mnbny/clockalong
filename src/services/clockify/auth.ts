import { isTauri } from '@tauri-apps/api/core'

import { clinearAuth } from '../tauri/authClient'

export async function getTauriClockifyApiKey() {
  const fallback = { clockifyApiKey: null as string | null }

  if (!isTauri()) {
    clockifyAuthLog('getTauriClockifyApiKey: non-Tauri runtime, using browser fallback')
    return fallback
  }

  clockifyAuthLog('getTauriClockifyApiKey: requesting Rust key snapshot')
  return clinearAuth.getClockifyApiKey()
}

function clockifyAuthLog(message: string) {
  console.info(`[clockify auth] ${message}`)
}
