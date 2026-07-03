import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../tauri/auth-client'

export async function getTauriGithubAccessToken() {
  const fallback = { accessToken: null as string | null }

  if (!isTauri()) {
    githubAuthLog('getTauriGithubAccessToken: non-Tauri runtime, using browser fallback')
    return fallback
  }

  githubAuthLog('getTauriGithubAccessToken: requesting Rust token snapshot')
  return auth.getGithubCredential()
}

function githubAuthLog(message: string) {
  console.info(`[github auth] ${message}`)
}
