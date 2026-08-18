import { invoke } from '@tauri-apps/api/core'

import { createTauriReactiveStateHook } from '../../utils/create-tauri-reactive-state-hook'

export type McpServerStatus = {
  bridgeReady: boolean
  lastError: string | null
  port: number | null
  running: boolean
  snapshotCapturedAt: string | null
}

export type McpStartTimerArguments = {
  id: string
  source: 'github' | 'linear' | 'quick_timer'
  variables?: Record<string, string>
}

export type McpCommandPayload =
  | {
      arguments: McpStartTimerArguments
      requestId: string
      tool: 'start_timer'
    }
  | {
      arguments: Record<string, never>
      requestId: string
      tool: 'stop_timer'
    }

export type McpStartTimerResult = {
  billable: boolean
  description: string
  entryId: string
  projectName: string | null
  startedAt: string
  stoppedPrevious: boolean
}

export type McpStopTimerResult = {
  description: string
  durationSeconds: number
  endedAt: string
  entryId: string
  startedAt: string
}

export type McpCommandResult = McpStartTimerResult | McpStopTimerResult

export type McpCommandCompletion =
  | {
      error?: never
      requestId: string
      result: McpCommandResult
    }
  | {
      error: string
      requestId: string
      result?: never
    }

export const clockalongMcpCommandEvent = 'clockalong-mcp:command'
export const clockalongMcpStateChangedEvent = 'clockalong-mcp:state-changed'

export const mcp = {
  completeCommand: (completion: McpCommandCompletion) => invoke<void>('clockalong_mcp_complete_command', completion),
  getStatus: () => invoke<McpServerStatus>('clockalong_mcp_get_state'),
  publishSnapshot: (capturedAt: string, snapshot: unknown) =>
    invoke<void>('clockalong_mcp_publish_snapshot', { capturedAt, snapshot }),
  setEnabled: (enabled: boolean) => invoke<McpServerStatus>('clockalong_mcp_set_enabled', { enabled }),
}

const unavailableMcpServerStatus = {
  bridgeReady: false,
  lastError: null,
  port: null,
  running: false,
  snapshotCapturedAt: null,
} satisfies McpServerStatus

export const useMcpServerStatus = createTauriReactiveStateHook({
  browserValue: unavailableMcpServerStatus,
  eventName: clockalongMcpStateChangedEvent,
  getSnapshot: mcp.getStatus,
  initialValue: unavailableMcpServerStatus,
  logScope: 'clockalong mcp',
  stateName: 'useMcpServerStatus',
})
