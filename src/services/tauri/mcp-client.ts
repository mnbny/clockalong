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

export type McpAddTimeEntryArguments = McpStartTimerArguments & {
  durationMinutes: number
  endedAt?: string
}

export type McpTelegramCommand = {
  requestId: string
  deadlineAt: number
} & (
  | { tool: 'list_telegram_destinations'; arguments: Record<string, never> }
  | {
      tool: 'send_telegram_message'
      arguments: { groupId: string; topicId: number | null; text?: string; fileName?: string; asFile?: boolean }
    }
)

export type McpTelegramDestinations = {
  group: { id: string; title: string; hasTopics: boolean }
  destinations: { topicId: number | null; title: string; closed: boolean }[]
}

export type McpTelegramMessageResult = { groupId: string; topicId: number | null; messageId: number }

export type McpCommandPayload =
  | McpTelegramCommand
  | {
      arguments: McpStartTimerArguments
      requestId: string
      tool: 'start_timer'
    }
  | {
      arguments: McpAddTimeEntryArguments
      requestId: string
      tool: 'add_time_entry'
    }
  | {
      arguments: Record<string, never>
      requestId: string
      tool: 'stop_timer'
    }
  | {
      arguments: Record<string, never>
      requestId: string
      tool: 'refresh'
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

export type McpAddTimeEntryResult = McpStopTimerResult & {
  billable: boolean
  projectName: string | null
}

export type McpRefreshResult = {
  capturedAt: string
  synced: string[]
}

export type McpCommandResult =
  | McpStartTimerResult
  | McpStopTimerResult
  | McpAddTimeEntryResult
  | McpRefreshResult
  | McpTelegramDestinations
  | McpTelegramMessageResult

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
  readTelegramAttachment: (requestId: string) =>
    invoke<ArrayBuffer>('clockalong_mcp_read_telegram_attachment', { requestId }),
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
