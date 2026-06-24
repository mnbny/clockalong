import { isTauri } from '@tauri-apps/api/core'

import { app } from '../services/tauri/appClient'
import { createTauriReactiveStateHook } from '../utils/createTauriReactiveStateHook'

export const appInitializationStateChangedEvent = 'app:initialization-state-changed'

export async function getAppInitializationState() {
  const fallback = { appInitializing: false }

  if (!isTauri()) {
    return fallback
  }

  return app.getInitializationState()
}

export const useTauriAppInitializationState = createTauriReactiveStateHook({
  browserValue: { appInitializing: false },
  eventName: appInitializationStateChangedEvent,
  getSnapshot: getAppInitializationState,
  initialValue: { appInitializing: true },
  logScope: 'app initialization',
  stateName: 'useTauriAppInitializationState',
})
