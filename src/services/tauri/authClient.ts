import { invoke } from '@tauri-apps/api/core'

export type ClinearAuthSnapshot = {
  linearAuthenticated: boolean
  clockifyAuthenticated: boolean
}

export type ClinearAuthProvider = 'linear' | 'clockify'

export type ClinearAuthStartResult = {
  provider: ClinearAuthProvider
  status: 'notImplemented'
}

export const clinearAuth = {
  getState: () => invoke<ClinearAuthSnapshot>('clinear_auth_get_state'),
  startClockifyAuthentication: () => invoke<ClinearAuthStartResult>('clinear_auth_start_clockify_authentication'),
  startLinearAuthentication: () => invoke<ClinearAuthStartResult>('clinear_auth_start_linear_authentication'),
}

export function isClinearAuthenticated(authState: ClinearAuthSnapshot) {
  return authState.linearAuthenticated && authState.clockifyAuthenticated
}
