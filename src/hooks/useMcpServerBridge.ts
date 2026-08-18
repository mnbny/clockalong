import type {
  ProjectDtoImplV1,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../services/clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'
import type { McpCommandPayload, McpCommandResult } from '../services/tauri/mcp-client'

import { useLiveQuery } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  const userQuery = useQuery<UserDtoV1>({
    enabled: false,
    queryKey: queryKeys.clockify.loggedUser,
  })
  const workspacesQuery = useQuery<WorkspaceDtoV1[]>({
    enabled: false,
    queryKey: queryKeys.clockify.workspaces,
  })
  const selectedWorkspace = useMemo(() => {
    const user = userQuery.data
    const workspaces = workspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
  }, [userQuery.data, workspacesQuery.data])
  const userId = userQuery.data?.id
  const workspaceId = selectedWorkspace?.id
  const runningEntryQuery = useQuery<TimeEntryWithRatesDtoV1[]>({
    enabled: false,
    queryKey: queryKeys.clockify.runningEntry({
      params: { userId, workspaceId },
    }),
  })
  const todayReportQuery = useQuery<TimeEntrySummaryReportDto>({
    enabled: false,
    queryKey: queryKeys.clockify.summaryReport({
      params: { period: 'today', userId, workspaceId },
    }),
  })
  const weekReportQuery = useQuery<TimeEntrySummaryReportDto>({
    enabled: false,
    queryKey: queryKeys.clockify.summaryReport({
      params: { period: 'week', userId, workspaceId },
    }),
  })
  const monthReportQuery = useQuery<TimeEntrySummaryReportDto>({
    enabled: false,
    queryKey: queryKeys.clockify.summaryReport({
      params: { period: 'month', userId, workspaceId },
    }),
  })
  const projectsQuery = useQuery<ProjectDtoImplV1[]>({
    enabled: false,
    queryKey: queryKeys.clockify.projects({ params: { workspaceId } }),
  })
  const runningEntry = useMemo(() => {
    const entries = runningEntryQuery.data ?? []
    return entries.find(entry => entry.userId === userId) ?? entries[0] ?? null
  }, [runningEntryQuery.data, userId])
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
        clockifyProjects: projectsQuery.data ?? [],
        clockifyReports: {
          month: monthReportQuery.data,
          today: todayReportQuery.data,
          week: weekReportQuery.data,
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
      clockifyTimerProject,
      githubWorkItemsQuery.data,
      githubConnected,
      linearSync.lastSyncResult?.viewerId,
      linearConnected,
      linearTicketsQuery.data,
      monthReportQuery.data,
      projectsQuery.data,
      quickTimers,
      quickTimersActiveEntry,
      quickTimersCache,
      quickTimersEnabled,
      runningEntry,
      selectedWorkspace?.name,
      todayReportQuery.data,
      userId,
      weekReportQuery.data,
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
