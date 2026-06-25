import { invoke } from '@tauri-apps/api/core'

export type AppInitializationSnapshot = {
  appInitializing: boolean
}

export const app = {
  getInitializationState: () => invoke<AppInitializationSnapshot>('app_get_initialization_state'),
  readLogFile: () => invoke<string>('app_read_log_file'),
  clearLogFile: () => invoke<void>('app_clear_log_file'),
}
