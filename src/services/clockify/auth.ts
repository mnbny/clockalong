import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../tauri/auth-client'

export async function getTauriClockifyApiKey() {
  const fallback = { apiKey: null as string | null }

  if (!isTauri()) {
    clockifyAuthLog('getTauriClockifyApiKey: non-Tauri runtime, using browser fallback')
    return fallback
  }

  clockifyAuthLog('getTauriClockifyApiKey: requesting Rust key snapshot')
  return auth.getClockifyCredential()
}

function clockifyAuthLog(message: string) {
  console.info(`[clockify auth] ${message}`)
}
