import { isTauri } from '@tauri-apps/api/core'

import { app } from '../services/tauri/app-client'
import { createTauriReactiveStateHook } from '../utils/create-tauri-reactive-state-hook'

export const appInitializationStateChangedEvent = 'app:initialization-state-changed'

export async function getAppInitializationState() {
  const fallback = { appInitializing: false }

  if (!isTauri()) {
    return fallback
  }

  return app.getInitializationState()
}

export const useAppInit = createTauriReactiveStateHook({
  browserValue: { appInitializing: false },
  eventName: appInitializationStateChangedEvent,
  getSnapshot: getAppInitializationState,
  initialValue: { appInitializing: true },
  logScope: 'app initialization',
  stateName: 'useAppInit',
})
