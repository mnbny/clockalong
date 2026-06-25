import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../tauri/auth-client'

export async function getTauriLinearAccessToken() {
  const fallback = { accessToken: null as string | null }

  if (!isTauri()) {
    linearAuthLog('getTauriLinearAccessToken: non-Tauri runtime, using browser fallback')
    return fallback
  }

  linearAuthLog('getTauriLinearAccessToken: requesting Rust token snapshot')
  return auth.getLinearCredential()
}

function linearAuthLog(message: string) {
  console.info(`[linear auth] ${message}`)
}
