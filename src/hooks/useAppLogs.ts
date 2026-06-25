import { isTauri } from '@tauri-apps/api/core'

import { app } from '../services/tauri/app-client'
import { createTauriReactiveStateHook } from '../utils/create-tauri-reactive-state-hook'

type AppLogsSnapshot = {
  contents: string
}

export async function getAppLogs(): Promise<AppLogsSnapshot> {
  const fallback = { contents: '' }

  if (!isTauri()) {
    appLogsLog('getAppLogs: non-Tauri runtime, using browser fallback')
    return fallback
  }

  appLogsLog('getAppLogs: requesting Rust log file snapshot')
  return { contents: await app.readLogFile() }
}

export const useAppLogs = createTauriReactiveStateHook({
  browserValue: { contents: '' },
  getSnapshot: getAppLogs,
  initialValue: { contents: '' },
  logScope: 'app logs',
  stateName: 'useAppLogs',
})

function appLogsLog(message: string) {
  console.info(`[app logs] ${message}`)
}
