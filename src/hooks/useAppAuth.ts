import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../services/tauri/auth-client'
import { createTauriReactiveStateHook } from '../utils/create-tauri-reactive-state-hook'

export const clockalongAuthStateChangedEvent = 'clockalong-auth:state-changed'

export async function getClockalongAuthState() {
  const fallback = {
    linearAuthenticated: false,
    githubAuthenticated: false,
    clockifyAuthenticated: false,
  }

  if (!isTauri()) {
    return fallback
  }

  return auth.getState()
}

export const useAppAuth = createTauriReactiveStateHook({
  browserValue: {
    linearAuthenticated: false,
    githubAuthenticated: false,
    clockifyAuthenticated: false,
  },
  eventName: clockalongAuthStateChangedEvent,
  getSnapshot: getClockalongAuthState,
  initialValue: {
    linearAuthenticated: false,
    githubAuthenticated: false,
    clockifyAuthenticated: false,
  },
  logScope: 'clockalong auth',
  stateName: 'useAppAuth',
})
