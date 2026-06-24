import { isTauri } from '@tauri-apps/api/core'

import { clinearAuth } from '../services/tauri/authClient'
import { createTauriReactiveStateHook } from '../utils/createTauriReactiveStateHook'

export const clinearAuthStateChangedEvent = 'clinear-auth:state-changed'

export async function getClinearAuthState() {
  const fallback = {
    linearAuthenticated: false,
    clockifyAuthenticated: false,
  }

  if (!isTauri()) {
    return fallback
  }

  return clinearAuth.getState()
}

export const useTauriClinearAuthState = createTauriReactiveStateHook({
  browserValue: {
    linearAuthenticated: false,
    clockifyAuthenticated: false,
  },
  eventName: clinearAuthStateChangedEvent,
  getSnapshot: getClinearAuthState,
  initialValue: {
    linearAuthenticated: false,
    clockifyAuthenticated: false,
  },
  logScope: 'clinear auth',
  stateName: 'useTauriClinearAuthState',
})
