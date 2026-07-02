import { invoke } from '@tauri-apps/api/core'

export type ClockalongAuthSnapshot = {
  linearAuthenticated: boolean
  clockifyAuthenticated: boolean
}

export type ClockalongAuthProvider = 'linear' | 'clockify'

export type ClockalongAuthConnectionResult = {
  provider: ClockalongAuthProvider
  status: 'connected'
}

export type ClockalongAuthDisconnectResult = {
  provider: ClockalongAuthProvider
  status: 'disconnected'
  revocationStatus?: 'confirmed' | 'failed' | 'skipped'
}

export type ClockalongClockifyCredentialSnapshot = {
  apiKey: string | null
}

export type ClockalongLinearCredentialSnapshot = {
  accessToken: string | null
}

export const auth = {
  connectClockify: (apiKey: string) =>
    invoke<ClockalongAuthConnectionResult>('clockalong_auth_connect_clockify', { apiKey }),
  connectLinear: () => invoke<ClockalongAuthConnectionResult>('clockalong_auth_connect_linear'),
  disconnectClockify: () => invoke<ClockalongAuthDisconnectResult>('clockalong_auth_disconnect_clockify'),
  disconnectLinear: () => invoke<ClockalongAuthDisconnectResult>('clockalong_auth_disconnect_linear'),
  getClockifyCredential: () => invoke<ClockalongClockifyCredentialSnapshot>('clockalong_auth_get_clockify_credential'),
  getLinearCredential: () => invoke<ClockalongLinearCredentialSnapshot>('clockalong_auth_get_linear_credential'),
  getState: () => invoke<ClockalongAuthSnapshot>('clockalong_auth_get_state'),
  refreshLinearCredential: () =>
    invoke<ClockalongLinearCredentialSnapshot>('clockalong_auth_refresh_linear_credential'),
}
