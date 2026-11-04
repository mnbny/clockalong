import { invoke, isTauri } from '@tauri-apps/api/core'

export type PaseoStatus = { available: boolean; detail: string; path?: string }
export type PaseoProject = { projectId: string; name: string; path: string; kind: string }
export type PaseoMode = { id: string; label: string; description?: string }
export type PaseoProvider = { id: string; label: string; defaultModeId: string | null; modes: PaseoMode[] }
export type PaseoModel = { id: string; label: string; thinkingOptionIds: string[]; defaultThinkingOptionId?: string }
export type PaseoLaunch = {
  projectId: string
  provider: string
  model: string
  thinking: string
  mode: string
  prompt: string
  title: string
  runId: string
  triggerId: string
  revision: string
  scope: string
}
export type PaseoCommandResult = {
  status: 'started' | 'completed' | 'failed' | 'unconfirmed' | 'cancelled'
  detail?: string
  agentId?: string
}

export const paseo = {
  detect: () =>
    isTauri()
      ? invoke<PaseoStatus>('paseo_detect')
      : Promise.resolve<PaseoStatus>({
          available: false,
          detail: 'Paseo integration is available in the desktop app.',
        }),
  projects: () => invoke<PaseoProject[]>('paseo_projects'),
  providers: () => invoke<PaseoProvider[]>('paseo_providers'),
  models: (provider: string) => invoke<PaseoModel[]>('paseo_models', { provider }),
  executeSample: (request: PaseoLaunch) => invoke<PaseoCommandResult>('paseo_execute_sample', { request }),
  execute: (request: PaseoLaunch) => invoke<PaseoCommandResult>('paseo_execute', { request }),
}
