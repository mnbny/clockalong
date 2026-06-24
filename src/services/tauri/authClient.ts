import { invoke } from '@tauri-apps/api/core'

export type ClinearAuthSnapshot = {
  linearAuthenticated: boolean
  clockifyAuthenticated: boolean
}

export type ClinearAuthProvider = 'linear' | 'clockify'

export type ClinearAuthStartResult = {
  provider: ClinearAuthProvider
  status: 'connected' | 'notImplemented'
}

export type ClinearAuthConnectionResult = {
  provider: ClinearAuthProvider
  status: 'connected'
}

export type ClinearAuthDisconnectResult = {
  provider: ClinearAuthProvider
  status: 'disconnected'
  revocationStatus: 'confirmed' | 'failed' | 'skipped'
}

export type ClinearClockifyApiKeySnapshot = {
  clockifyApiKey: string | null
}

export type ClinearLinearAccessTokenSnapshot = {
  linearAccessToken: string | null
}

export const clinearAuth = {
  clearClockifyAuthentication: () => invoke<void>('clinear_auth_clear_clockify_authentication'),
  connectClockifyApiKey: (apiKey: string) =>
    invoke<ClinearAuthConnectionResult>('clinear_auth_connect_clockify_api_key', { apiKey }),
  disconnectLinear: () => invoke<ClinearAuthDisconnectResult>('clinear_auth_disconnect_linear'),
  getClockifyApiKey: () => invoke<ClinearClockifyApiKeySnapshot>('clinear_auth_get_clockify_api_key'),
  getLinearAccessToken: () => invoke<ClinearLinearAccessTokenSnapshot>('clinear_auth_get_linear_access_token'),
  getState: () => invoke<ClinearAuthSnapshot>('clinear_auth_get_state'),
  startClockifyAuthentication: () => invoke<ClinearAuthStartResult>('clinear_auth_start_clockify_authentication'),
  startLinearAuthentication: () => invoke<ClinearAuthStartResult>('clinear_auth_start_linear_authentication'),
}

export function isClinearAuthenticated(authState: ClinearAuthSnapshot) {
  return authState.linearAuthenticated && authState.clockifyAuthenticated
}
