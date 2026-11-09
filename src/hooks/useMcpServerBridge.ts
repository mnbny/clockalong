import type {
  ProjectDtoImplV1,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../services/clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'
import type { BuildMcpSnapshotInput } from '../services/mcp/snapshot'
import type { McpCommandPayload, McpCommandResult, McpTelegramCommand } from '../services/tauri/mcp-client'
import type { QueryKey } from '@tanstack/react-query'

import { hashKey, useQueryClient } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { queryKeys } from '../lib/query-client'
import { selectClockifyWorkspace } from '../services/clockify/workspaces'
import { db } from '../services/db'
import { useLinearSync } from '../services/linear/sync'
import { executeMcpCommand, type ExecuteMcpCommandContext } from '../services/mcp/commands'
import { publishMcpSnapshot, refreshMcpSnapshot } from '../services/mcp/refresh'
import { executeMcpTelegramCommand, type McpTelegramContext } from '../services/mcp/telegram'
import { listMcpWork, type McpListWorkArguments } from '../services/mcp/work-list'
import { useStorage } from '../services/storage/useStorage'
import { clockalongMcpCommandEvent, mcp } from '../services/tauri/mcp-client'
import { useTelegram } from '../services/telegram/session-provider'
import { getErrorMessage } from '../utils/errors'
import { useAppAuth } from './useAppAuth'
import { useAppInit } from './useAppInit'
import { useClockifyTimerProject } from './useClockifyTimerProject'

type IncomingMcpCommand = {
  deadlineAt: unknown
  arguments: unknown
  requestId: unknown
  tool: unknown
}

export function useMcpServerBridge() {
  const telegram = useTelegram()
  const telegramRef = useRef(telegram)
  telegramRef.current = telegram
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const linearSync = useLinearSync()
  const [mcpServerEnabled] = useStorage('mcpServerEnabled')
  const [githubSelectedRepositories] = useStorage('githubSelectedRepositories')
  const [githubVisibleWorkItemTypes] = useStorage('githubVisibleWorkItemTypes')
  const [quickTimers] = useStorage('quickTimers')
  const [quickTimersActiveEntry] = useStorage('quickTimersActiveEntry')
  const [quickTimersCache] = useStorage('quickTimersCache')
  const [quickTimersEnabled] = useStorage('quickTimersEnabled')
  const [commandListenerReady, setCommandListenerReady] = useState(false)
  const clockifyTimerProject = useClockifyTimerProject()
  const revisions = useLiveQuery(async () => {
    if (!mcpServerEnabled) return
    try {
      const [github, linear, clockify] = await Promise.all([
        db.githubCacheMeta.get('revision'),
        db.linearCacheMeta.get('state'),
        db.clockifyCacheMeta.get('revision'),
      ])
      return { github: github?.revision, linear: linear?.revision, clockify: clockify?.revision }
    } catch {
      mcpBridgeLog('could not read database revisions')
      return undefined
    }
  }, [mcpServerEnabled])
  const user = useCachedQueryData<UserDtoV1>(queryKeys.clockify.loggedUser, mcpServerEnabled)
  const workspaces = useCachedQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces, mcpServerEnabled)
  const selectedWorkspace = useMemo(() => {
    if (!user || !workspaces?.length) {
      return null
    }

    return selectClockifyWorkspace(user, workspaces)
  }, [user, workspaces])
  const userId = user?.id
  const workspaceId = selectedWorkspace?.id
  const runningEntries = useCachedQueryData<TimeEntryWithRatesDtoV1[]>(
    queryKeys.clockify.runningEntry({
      params: { userId, workspaceId },
    }),
    mcpServerEnabled,
  )
  const todayReport = useCachedQueryData<TimeEntrySummaryReportDto>(
    queryKeys.clockify.summaryReport({
      params: { period: 'today', userId, workspaceId },
    }),
    mcpServerEnabled,
  )
  const weekReport = useCachedQueryData<TimeEntrySummaryReportDto>(
    queryKeys.clockify.summaryReport({
      params: { period: 'week', userId, workspaceId },
    }),
    mcpServerEnabled,
  )
  const monthReport = useCachedQueryData<TimeEntrySummaryReportDto>(
    queryKeys.clockify.summaryReport({
      params: { period: 'month', userId, workspaceId },
    }),
    mcpServerEnabled,
  )
  const clockifyProjects = useCachedQueryData<ProjectDtoImplV1[]>(
    queryKeys.clockify.projects({ params: { workspaceId } }),
    mcpServerEnabled,
  )
  const runningEntry = useMemo(() => {
    const entries = runningEntries ?? []
    return entries.find(entry => entry.userId === userId) ?? entries[0] ?? null
  }, [runningEntries, userId])
  const appReady = !appInitializationState.value.appInitializing && !authState.loading
  const clockifyConnected = appReady && authState.value.clockifyAuthenticated
  const githubConnected = clockifyConnected && authState.value.githubAuthenticated
  const linearConnected = clockifyConnected && authState.value.linearAuthenticated
  const snapshotInput = useMemo(
    () =>
      ({
        clockifyConnected,
        clockifyProjects: clockifyProjects ?? [],
        clockifyReports: {
          month: monthReport,
          today: todayReport,
          week: weekReport,
        },
        clockifyTimerProject,
        clockifyUserId: userId,
        clockifyWorkspaceId: workspaceId,
        clockifyWorkspaceName: selectedWorkspace?.name ?? null,
        githubConnected,
        linearConnected,
        linearViewerId: linearSync.viewerId,
        quickTimers,
        quickTimersActiveEntry,
        quickTimersCache,
        quickTimersEnabled,
        runningEntry,
      }) satisfies BuildMcpSnapshotInput,
    [
      clockifyConnected,
      revisions?.clockify,
      clockifyProjects,
      clockifyTimerProject,
      githubConnected,
      revisions?.github,
      githubSelectedRepositories,
      githubVisibleWorkItemTypes,
      linearSync.viewerId,
      linearConnected,
      revisions?.linear,
      monthReport,
      quickTimers,
      quickTimersActiveEntry,
      quickTimersCache,
      quickTimersEnabled,
      runningEntry,
      selectedWorkspace?.name,
      todayReport,
      userId,
      weekReport,
      workspaceId,
    ],
  )
  const commandContext = useMemo(
    () => ({
      clockifyConnected,
      githubConnected,
      linearConnected,
      clockifyTimerProject,
      linearViewerId: linearSync.viewerId,
      runningEntry,
    }),
    [clockifyConnected, githubConnected, linearConnected, clockifyTimerProject, linearSync.viewerId, runningEntry],
  ) satisfies ExecuteMcpCommandContext
  const commandContextRef = useRef(commandContext)
  commandContextRef.current = commandContext
  const snapshotInputRef = useRef(snapshotInput)
  snapshotInputRef.current = snapshotInput

  useEffect(() => {
    if (!mcpServerEnabled || !commandListenerReady) {
      return
    }

    void publishMcpSnapshot(snapshotInput)
      .then(snapshot => {
        mcpBridgeLog('published snapshot', {
          githubRows: snapshot.trackableWork.filter(row => row.source === 'github').length,
          linearRows: snapshot.trackableWork.filter(row => row.source === 'linear').length,
          quickTimerRows: snapshot.trackableWork.filter(row => row.source === 'quick_timer').length,
        })
      })
      .catch(() => {
        mcpBridgeLog('snapshot publish failed')
      })
  }, [commandListenerReady, mcpServerEnabled, snapshotInput])

  useEffect(() => {
    if (!mcpServerEnabled || !isTauri()) {
      setCommandListenerReady(false)
      return
    }

    setCommandListenerReady(false)
    let active = true
    let unlisten: (() => void) | undefined
    const pendingLists = new Map<string, AbortController>()
    const cancelledLists = new Set<string>()

    listen<string>('clockalong-mcp:cancel', event => {
      const controller = pendingLists.get(event.payload)
      if (controller) controller.abort()
      else {
        cancelledLists.add(event.payload)
        setTimeout(() => cancelledLists.delete(event.payload), 30_000)
      }
    })
      .then(async stopCancel => {
        if (!active) {
          stopCancel()
          return
        }
        let stopCommands: () => void
        try {
          stopCommands = await listen<IncomingMcpCommand>(clockalongMcpCommandEvent, event => {
            if (!active) return
            const id = event.payload.requestId
            const controller =
              event.payload.tool === 'list_trackable_work' && typeof id === 'string' ? new AbortController() : undefined
            if (controller && typeof id === 'string') {
              pendingLists.set(id, controller)
              if (cancelledLists.delete(id)) controller.abort()
            }
            void handleMcpCommand(
              event.payload,
              commandContextRef,
              snapshotInputRef,
              telegramRef,
              controller?.signal,
            ).finally(() => {
              if (controller && typeof id === 'string') pendingLists.delete(id)
            })
          })
        } catch (error) {
          stopCancel()
          throw error
        }
        if (active) {
          unlisten = () => {
            stopCancel()
            stopCommands()
          }
          setCommandListenerReady(true)
        } else {
          stopCancel()
          stopCommands()
        }
      })
      .catch(() => {
        mcpBridgeLog('command subscription failed')
      })

    return () => {
      active = false
      pendingLists.forEach(controller => controller.abort())
      unlisten?.()
    }
  }, [mcpServerEnabled])
}

function useCachedQueryData<T>(queryKey: QueryKey, enabled: boolean) {
  const queryClient = useQueryClient()
  const queryHash = hashKey(queryKey)
  const getSnapshot = useCallback(() => {
    if (!enabled) {
      return undefined
    }

    return queryClient.getQueryCache().get(queryHash)?.state.data as T | undefined
  }, [enabled, queryClient, queryHash])
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) {
        return () => {}
      }

      return queryClient.getQueryCache().subscribe(event => {
        if (event.query.queryHash === queryHash) {
          onStoreChange()
        }
      })
    },
    [enabled, queryClient, queryHash],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

async function handleMcpCommand(
  incoming: IncomingMcpCommand,
  contextRef: { current: ExecuteMcpCommandContext },
  snapshotInputRef: { current: BuildMcpSnapshotInput },
  telegramRef: { current: McpTelegramContext },
  signal?: AbortSignal,
) {
  if (typeof incoming.requestId !== 'string') {
    mcpBridgeLog('ignored command without request id')
    return
  }

  const requestId = incoming.requestId
  const tool = typeof incoming.tool === 'string' ? incoming.tool : 'unknown'

  mcpBridgeLog('command received', { requestId, tool })

  if (tool === 'list_telegram_destinations' || tool === 'send_telegram_message') {
    try {
      const result = await executeMcpTelegramCommand(incoming as McpTelegramCommand, () => telegramRef.current)
      await completeMcpCommand({ requestId, result, tool })
    } catch (error) {
      await completeMcpCommand({ error: getErrorMessage(error), requestId, tool })
    }
    return
  }

  if (tool === 'list_trackable_work') {
    try {
      if (!isCommandArguments(incoming.arguments) || typeof incoming.deadlineAt !== 'number')
        throw new Error('Invalid list request')
      const result = await listMcpWork(
        incoming.arguments as McpListWorkArguments,
        snapshotInputRef.current,
        incoming.deadlineAt,
        signal,
      )
      await completeMcpCommand({ requestId, result, tool })
    } catch (error) {
      await completeMcpCommand({ error: getErrorMessage(error), requestId, tool })
    }
    return
  }

  if (tool === 'refresh') {
    try {
      const result = await refreshMcpSnapshot(() => snapshotInputRef.current)
      await completeMcpCommand({ requestId, result, tool })
    } catch (error) {
      await completeMcpCommand({ error: getErrorMessage(error), requestId, tool })
    }
    return
  }

  if (
    tool !== 'start_timer' &&
    tool !== 'stop_timer' &&
    tool !== 'add_time_entry' &&
    tool !== 'fix_overlaps' &&
    tool !== 'collapse_entries'
  ) {
    await completeMcpCommand({
      error: `Unsupported MCP command: ${tool}`,
      requestId,
      tool,
    })
    return
  }

  const command = {
    arguments: isCommandArguments(incoming.arguments) ? incoming.arguments : {},
    requestId,
    tool,
  } as McpCommandPayload
  const execution = await executeMcpCommand(command, contextRef.current)
  if (execution.ok && (tool === 'fix_overlaps' || tool === 'collapse_entries') && 'refreshFailed' in execution.result) {
    try {
      await publishMcpSnapshot(snapshotInputRef.current)
    } catch {
      execution.result = { ...execution.result, refreshFailed: true }
      mcpBridgeLog('snapshot publish failed after entry changes', { tool })
    }
  }

  await completeMcpCommand(
    execution.ok ? { requestId, result: execution.result, tool } : { error: execution.error.message, requestId, tool },
  )
}

async function completeMcpCommand(
  completion:
    | { error: string; requestId: string; tool: string }
    | { requestId: string; result: McpCommandResult; tool: string },
) {
  const { requestId, tool } = completion

  try {
    if ('error' in completion) {
      await mcp.completeCommand({ error: completion.error, requestId })
      mcpBridgeLog('command completed with error', { requestId, tool })
      return
    }

    await mcp.completeCommand({ requestId, result: completion.result })
    mcpBridgeLog('command completed successfully', { requestId, tool })
  } catch {
    mcpBridgeLog('command completion failed', { requestId, tool })
  }
}

function isCommandArguments(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function mcpBridgeLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockalong mcp] ${message}`)
    return
  }

  console.info(`[clockalong mcp] ${message}`, details)
}
