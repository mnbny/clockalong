import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow, type Theme } from '@tauri-apps/api/window'

export type AppInitializationSnapshot = {
  appInitializing: boolean
}

export const app = {
  getInitializationState: () => invoke<AppInitializationSnapshot>('app_get_initialization_state'),
  readLogFile: () => invoke<string>('app_read_log_file'),
  clearLogFile: () => invoke<void>('app_clear_log_file'),
  setWindowTheme: (theme: Theme) => (isTauri() ? getCurrentWindow().setTheme(theme) : Promise.resolve()),
  showWindow: () => (isTauri() ? getCurrentWindow().show() : Promise.resolve()),
}
