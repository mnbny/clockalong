import type {
  ProjectDtoImplV1,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../services/clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'
import type { McpCommandPayload, McpCommandResult } from '../services/tauri/mcp-client'
import type { QueryKey } from '@tanstack/react-query'

import { useLiveQuery } from '@tanstack/react-db'
import { hashKey, useQueryClient } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { queryKeys } from '../lib/query-client'
import { clockifyTimeEntriesCollection } from '../services/clockify/sync'
import { githubWorkItemsCollection } from '../services/github/sync'
import { linearTicketsCollection, useLinearSync } from '../services/linear/sync'
import { executeMcpCommand, type ExecuteMcpCommandContext } from '../services/mcp/commands'
import { buildMcpSnapshot } from '../services/mcp/snapshot'
import { useStorage } from '../services/storage/useStorage'
import { clockalongMcpCommandEvent, mcp } from '../services/tauri/mcp-client'
import { useAppAuth } from './useAppAuth'
import { useAppInit } from './useAppInit'
import { useClockifyTimerProject } from './useClockifyTimerProject'

type IncomingMcpCommand = {
  arguments: unknown
  requestId: unknown
  tool: unknown
}

export function useMcpServerBridge() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const linearSync = useLinearSync()
  const [mcpServerEnabled] = useStorage('mcpServerEnabled')
  const [quickTimers] = useStorage('quickTimers')
  const [quickTimersActiveEntry] = useStorage('quickTimersActiveEntry')
  const [quickTimersCache] = useStorage('quickTimersCache')
  const [quickTimersEnabled] = useStorage('quickTimersEnabled')
  const [commandListenerReady, setCommandListenerReady] = useState(false)
  const clockifyTimerProject = useClockifyTimerProject()
  const user = useCachedQueryData<UserDtoV1>(queryKeys.clockify.loggedUser, mcpServerEnabled)
  const workspaces = useCachedQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces, mcpServerEnabled)
  const selectedWorkspace = useMemo(() => {
    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
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
  const linearTicketsQuery = useLiveQuery(
    query => {
      if (!mcpServerEnabled) {
        return null
      }

      return query.from({ syncedTicket: linearTicketsCollection })
    },
    [mcpServerEnabled],
  )
  const githubWorkItemsQuery = useLiveQuery(
    query => {
      if (!mcpServerEnabled) {
        return null
      }

      return query.from({ syncedWorkItem: githubWorkItemsCollection })
    },
    [mcpServerEnabled],
  )
  const clockifyEntriesQuery = useLiveQuery(
    query => {
      if (!mcpServerEnabled) {
        return null
      }

      return query.from({ syncedEntry: clockifyTimeEntriesCollection })
    },
    [mcpServerEnabled],
  )
  const appReady = !appInitializationState.value.appInitializing && !authState.loading
  const clockifyConnected = appReady && authState.value.clockifyAuthenticated
  const githubConnected = clockifyConnected && authState.value.githubAuthenticated
  const linearConnected = clockifyConnected && authState.value.linearAuthenticated
  const snapshot = useMemo(
    () =>
      buildMcpSnapshot({
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
        githubWorkItems: githubWorkItemsQuery.data ?? [],
        linearConnected,
        linearTickets: linearTicketsQuery.data ?? [],
        linearViewerId: linearSync.lastSyncResult?.viewerId ?? null,
        quickTimers,
        quickTimersActiveEntry,
        quickTimersCache,
        quickTimersEnabled,
        runningEntry,
        syncedClockifyEntries: clockifyEntriesQuery.data ?? [],
      }),
    [
      clockifyConnected,
      clockifyEntriesQuery.data,
      clockifyProjects,
      clockifyTimerProject,
      githubWorkItemsQuery.data,
      githubConnected,
      linearSync.lastSyncResult?.viewerId,
      linearConnected,
      linearTicketsQuery.data,
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
      clockifyTimerProject,
      linearViewerId: linearSync.lastSyncResult?.viewerId ?? null,
      runningEntry,
    }),
    [clockifyConnected, clockifyTimerProject, linearSync.lastSyncResult?.viewerId, runningEntry],
  ) satisfies ExecuteMcpCommandContext
  const commandContextRef = useRef(commandContext)
  commandContextRef.current = commandContext

  useEffect(() => {
    if (!mcpServerEnabled || !commandListenerReady) {
      return
    }

    mcpBridgeLog('publishing snapshot', {
      githubRows: snapshot.trackableWork.filter(row => row.source === 'github').length,
      linearRows: snapshot.trackableWork.filter(row => row.source === 'linear').length,
      quickTimerRows: snapshot.trackableWork.filter(row => row.source === 'quick_timer').length,
    })
    void mcp.publishSnapshot(snapshot.capturedAt, snapshot).catch(() => {
      mcpBridgeLog('snapshot publish failed')
    })
  }, [commandListenerReady, mcpServerEnabled, snapshot])

  useEffect(() => {
    if (!mcpServerEnabled || !isTauri()) {
      setCommandListenerReady(false)
      return
    }

    setCommandListenerReady(false)
    let active = true
    let unlisten: (() => void) | undefined

    listen<IncomingMcpCommand>(clockalongMcpCommandEvent, event => {
      if (!active) {
        return
      }

      void handleMcpCommand(event.payload, commandContextRef)
    })
      .then(nextUnlisten => {
        if (active) {
          unlisten = nextUnlisten
          setCommandListenerReady(true)
        } else {
          nextUnlisten()
        }
      })
      .catch(() => {
        mcpBridgeLog('command subscription failed')
      })

    return () => {
      active = false
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

async function handleMcpCommand(incoming: IncomingMcpCommand, contextRef: { current: ExecuteMcpCommandContext }) {
  if (typeof incoming.requestId !== 'string') {
    mcpBridgeLog('ignored command without request id')
    return
  }

  const requestId = incoming.requestId
  const tool = typeof incoming.tool === 'string' ? incoming.tool : 'unknown'

  mcpBridgeLog('command received', { requestId, tool })

  if (tool !== 'start_timer' && tool !== 'stop_timer') {
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
