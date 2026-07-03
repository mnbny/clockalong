import { invoke } from '@tauri-apps/api/core'

export type ClockalongAuthSnapshot = {
  linearAuthenticated: boolean
  githubAuthenticated: boolean
  clockifyAuthenticated: boolean
}

export type ClockalongAuthProvider = 'linear' | 'github' | 'clockify'

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

export type ClockalongGithubCredentialSnapshot = {
  accessToken: string | null
}

export const auth = {
  connectClockify: (apiKey: string) =>
    invoke<ClockalongAuthConnectionResult>('clockalong_auth_connect_clockify', { apiKey }),
  connectGithub: (accessToken: string) =>
    invoke<ClockalongAuthConnectionResult>('clockalong_auth_connect_github', { accessToken }),
  connectLinear: () => invoke<ClockalongAuthConnectionResult>('clockalong_auth_connect_linear'),
  disconnectClockify: () => invoke<ClockalongAuthDisconnectResult>('clockalong_auth_disconnect_clockify'),
  disconnectGithub: () => invoke<ClockalongAuthDisconnectResult>('clockalong_auth_disconnect_github'),
  disconnectLinear: () => invoke<ClockalongAuthDisconnectResult>('clockalong_auth_disconnect_linear'),
  getClockifyCredential: () => invoke<ClockalongClockifyCredentialSnapshot>('clockalong_auth_get_clockify_credential'),
  getGithubCredential: () => invoke<ClockalongGithubCredentialSnapshot>('clockalong_auth_get_github_credential'),
  getLinearCredential: () => invoke<ClockalongLinearCredentialSnapshot>('clockalong_auth_get_linear_credential'),
  getState: () => invoke<ClockalongAuthSnapshot>('clockalong_auth_get_state'),
  refreshLinearCredential: () =>
    invoke<ClockalongLinearCredentialSnapshot>('clockalong_auth_refresh_linear_credential'),
}
