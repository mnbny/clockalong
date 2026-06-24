import { isTauri } from '@tauri-apps/api/core'

import { app } from '../services/tauri/appClient'
import { createTauriReactiveStateHook } from '../utils/createTauriReactiveStateHook'

type AppLogsSnapshot = {
  contents: string
}

export async function getTauriAppLogs(): Promise<AppLogsSnapshot> {
  const fallback = { contents: '' }

  if (!isTauri()) {
    appLogsLog('getTauriAppLogs: non-Tauri runtime, using browser fallback')
    return fallback
  }

  appLogsLog('getTauriAppLogs: requesting Rust log file snapshot')
  return { contents: await app.readLogFile() }
}

export const useTauriAppLogs = createTauriReactiveStateHook({
  browserValue: { contents: '' },
  getSnapshot: getTauriAppLogs,
  initialValue: { contents: '' },
  logScope: 'app logs',
  stateName: 'useTauriAppLogs',
})

function appLogsLog(message: string) {
  console.info(`[app logs] ${message}`)
}
