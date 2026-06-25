import { invoke } from '@tauri-apps/api/core'

export type ClinearAuthSnapshot = {
  linearAuthenticated: boolean
  clockifyAuthenticated: boolean
}

export type ClinearAuthProvider = 'linear' | 'clockify'

export type ClinearAuthConnectionResult = {
  provider: ClinearAuthProvider
  status: 'connected'
}

export type ClinearAuthDisconnectResult = {
  provider: ClinearAuthProvider
  status: 'disconnected'
  revocationStatus?: 'confirmed' | 'failed' | 'skipped'
}

export type ClinearClockifyCredentialSnapshot = {
  apiKey: string | null
}

export type ClinearLinearCredentialSnapshot = {
  accessToken: string | null
}

export const auth = {
  connectClockify: (apiKey: string) => invoke<ClinearAuthConnectionResult>('clinear_auth_connect_clockify', { apiKey }),
  connectLinear: () => invoke<ClinearAuthConnectionResult>('clinear_auth_connect_linear'),
  disconnectClockify: () => invoke<ClinearAuthDisconnectResult>('clinear_auth_disconnect_clockify'),
  disconnectLinear: () => invoke<ClinearAuthDisconnectResult>('clinear_auth_disconnect_linear'),
  getClockifyCredential: () => invoke<ClinearClockifyCredentialSnapshot>('clinear_auth_get_clockify_credential'),
  getLinearCredential: () => invoke<ClinearLinearCredentialSnapshot>('clinear_auth_get_linear_credential'),
  getState: () => invoke<ClinearAuthSnapshot>('clinear_auth_get_state'),
  refreshLinearCredential: () => invoke<ClinearLinearCredentialSnapshot>('clinear_auth_refresh_linear_credential'),
}
