import type {
  CreateTimeEntryRequest,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../clockify/generated/clockify'
import type { ClockifyProject } from '../storage/config'
import type {
  McpAddTimeEntryResult,
  McpCommandPayload,
  McpCommandResult,
  McpStartTimerArguments,
  McpStopTimerArguments,
} from '../tauri/mcp-client'

import { isTauri } from '@tauri-apps/api/core'
import axios from 'axios'

import { getClockalongAuthState } from '../../hooks/useAppAuth'
import { queryClient, queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { clockify } from '../clockify/client'
import { collapseClockifyMonthEntries } from '../clockify/collapse-entries'
import { clockifyEntryCache } from '../clockify/entry-cache'
import { fixClockifyMonthOverlaps } from '../clockify/overlap-repair'
import { cacheClockifyEntryResult } from '../clockify/sync'
import { createClockifyTimeEntry, getRunningClockifyTimeEntries, stopClockifyTimeEntry } from '../clockify/time-entries'
import {
  type ClockifyTimeEntryInterval,
  getClockifyTimeEntryIntervalFromMinutes,
} from '../clockify/time-entry-interval'
import { selectClockifyWorkspace } from '../clockify/workspaces'
import { db } from '../db'
import { formatGithubWorkItemDescription, getGithubTimeEntryBody } from '../github/timers'
import { isGithubItemInScope } from '../github/work-item-cache'
import { linearTicketCache } from '../linear/ticket-cache'
import { toLinearTicket } from '../linear/tickets'
import { getTicketTimeEntryBody } from '../linear/timers'
import {
  getQuickTimerTimeEntryBody,
  persistQuickTimerActiveEntry,
  persistQuickTimerValues,
  resolveQuickTimerValues,
} from '../quick-timers/timers'
import { storage } from '../storage/config'
import { invalidateTracking, refreshStoppedTimer, startTrackedTimer, stopTrackedTimer } from '../tracking/coordinator'
import { readTrackedTimers, retireEndedClockifyTimers } from '../tracking/store'

export type McpCommandErrorCode =
  | 'clockify_disconnected'
  | 'clockify_error'
  | 'missing_project'
  | 'no_running_timer'
  | 'unknown_target'
  | 'unsupported_command'

export type McpCommandError = {
  code: McpCommandErrorCode
  message: string
}

export type McpCommandExecution =
  | {
      error: McpCommandError
      ok: false
    }
  | {
      ok: true
      result: McpCommandResult
    }

export type ExecuteMcpCommandContext = {
  clockifyConnected: boolean
  githubConnected: boolean
  linearConnected: boolean
  clockifyTimerProject: ClockifyProject | null
  linearViewerId: string | null
  runningEntry: TimeEntryWithRatesDtoV1 | null
}

const clockifyDisconnectedMessage = 'Clockify is not connected. Connect it in Clockalong before tracking time.'
const missingProjectMessage = 'No Clockify project is selected. Choose a default project in Clockalong settings.'
const unknownTargetMessage = 'No trackable work item matches that id. Call list_trackable_work first.'

export async function executeMcpCommand(
  command: McpCommandPayload,
  context: ExecuteMcpCommandContext,
): Promise<McpCommandExecution> {
  if (!context.clockifyConnected) {
    return commandError('clockify_disconnected', clockifyDisconnectedMessage)
  }

  const lifecycle = clockifyEntryCache.getLifecycle()
  try {
    switch (command.tool) {
      case 'start_timer': {
        const execution = await executeCreateTimeEntry(
          command.arguments,
          context,
          lifecycle,
          undefined,
          command.deadlineAt,
        )
        return execution
      }
      case 'add_time_entry': {
        const interval = getClockifyTimeEntryIntervalFromMinutes(
          command.arguments.durationMinutes,
          command.arguments.endedAt === undefined ? new Date() : new Date(command.arguments.endedAt),
        )
        const execution = await executeCreateTimeEntry(command.arguments, context, lifecycle, interval)
        return execution
      }
      case 'stop_timer': {
        const execution = await executeStopTimer(command.arguments, lifecycle)
        return execution
      }
      case 'fix_overlaps':
      case 'collapse_entries': {
        const user = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)
        const workspaces = queryClient.getQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces)
        const workspace = selectClockifyWorkspace(user, workspaces)
        if (!user?.id || !workspace?.id) {
          return commandError('clockify_error', 'Clockify account or workspace is not ready. Refresh and try again.')
        }
        const operation = command.tool === 'fix_overlaps' ? fixClockifyMonthOverlaps : collapseClockifyMonthEntries
        const result = await operation({ userId: user.id, workspaceId: workspace.id }, user.settings?.timeZone)
        return { ok: true, result }
      }
      default:
        return commandError('unsupported_command', `Unsupported MCP command: ${String(command)}`)
    }
  } catch (error) {
    return commandError('clockify_error', getErrorMessage(error))
  }
}

async function executeCreateTimeEntry(
  arguments_: McpStartTimerArguments,
  context: ExecuteMcpCommandContext,
  lifecycle: number,
  interval?: ClockifyTimeEntryInterval,
  deadlineAt?: number,
): Promise<McpCommandExecution> {
  const project = context.clockifyTimerProject

  if (!project) {
    return commandError('missing_project', missingProjectMessage)
  }

  const billable = await storage.get('clockifyBillable')
  let body: CreateTimeEntryRequest

  switch (arguments_.source) {
    case 'linear': {
      if (!context.linearConnected) return commandError('unknown_target', unknownTargetMessage)
      const linearLifecycle = linearTicketCache.getLifecycle()
      const ticket = await getLinearTicket(arguments_.id, context.linearViewerId)

      if (!ticket) {
        return commandError('unknown_target', unknownTargetMessage)
      }

      const [descriptionTemplate, descriptionTemplateFallback] = await Promise.all([
        storage.get('clockifyDescriptionTemplate'),
        storage.get('clockifyDescriptionTemplateFallback'),
      ])
      if (
        linearLifecycle !== linearTicketCache.getLifecycle() ||
        (isTauri() && !(await getClockalongAuthState()).linearAuthenticated) ||
        !(await getLinearTicket(arguments_.id, context.linearViewerId)) ||
        linearLifecycle !== linearTicketCache.getLifecycle()
      )
        return commandError('unknown_target', unknownTargetMessage)
      body = getTicketTimeEntryBody({
        billable,
        interval,
        descriptionTemplate,
        descriptionTemplateFallback,
        projectId: project.projectId,
        ticket,
        workspaceId: project.workspaceId,
      })
      break
    }
    case 'github': {
      if (!context.githubConnected) return commandError('unknown_target', unknownTargetMessage)
      const workItem = await getGithubWorkItem(arguments_.id)

      if (!workItem) {
        return commandError('unknown_target', unknownTargetMessage)
      }

      const [issueTemplate, issueTemplateFallback, pullRequestTemplate, pullRequestTemplateFallback] =
        await Promise.all([
          storage.get('githubIssueDescriptionTemplate'),
          storage.get('githubIssueDescriptionTemplateFallback'),
          storage.get('githubPullRequestDescriptionTemplate'),
          storage.get('githubPullRequestDescriptionTemplateFallback'),
        ])
      const description = formatGithubWorkItemDescription({
        issueTemplate,
        issueTemplateFallback,
        item: workItem,
        pullRequestTemplate,
        pullRequestTemplateFallback,
      })
      if (
        (isTauri() && !(await getClockalongAuthState()).githubAuthenticated) ||
        !(await getGithubWorkItem(arguments_.id))
      ) {
        return commandError('unknown_target', unknownTargetMessage)
      }
      body = getGithubTimeEntryBody({
        billable,
        interval,
        description,
        item: workItem,
        projectId: project.projectId,
        workspaceId: project.workspaceId,
      })
      break
    }
    case 'quick_timer': {
      const [quickTimers, quickTimersCache] = await Promise.all([
        storage.get('quickTimers'),
        storage.get('quickTimersCache'),
      ])
      const preset = quickTimers.find(timer => timer.id === arguments_.id)

      if (!preset) {
        return commandError('unknown_target', unknownTargetMessage)
      }

      const values = resolveQuickTimerValues({
        cache: quickTimersCache,
        preset,
        values: arguments_.variables,
      })
      body = getQuickTimerTimeEntryBody({ billable, interval, preset, project, values })
      await persistQuickTimerValues({ preset, values })

      break
    }
  }

  if (!interval) {
    const result = await startTrackedTimer(
      {
        body,
        workspaceId: project.workspaceId,
        projectName: project.projectName,
        callerId: arguments_.callerId ?? null,
        source: arguments_.source,
        sourceId: arguments_.id,
      },
      deadlineAt,
      lifecycle,
    )
    if (arguments_.source === 'quick_timer' && result.mode === 'clockify' && result.entryId) {
      try {
        await persistQuickTimerActiveEntry({ entryId: result.entryId, quickTimerId: arguments_.id })
      } catch {
        console.warn('[mcp command] Could not save Quick Timer display association.')
      }
    }
    return { ok: true, result }
  }
  const entry = await createClockifyTimeEntry(body, project.workspaceId)
  const result = getAddTimeEntryResult(entry, project)
  try {
    await cacheClockifyEntryResult(entry, { workspaceId: project.workspaceId, timeInterval: interval }, lifecycle)
  } catch (error) {
    console.warn('[mcp command] Could not cache created Clockify entry:', error)
  }
  invalidateTracking()

  return { ok: true, result }
}

async function executeStopTimer(arguments_: McpStopTimerArguments, lifecycle: number): Promise<McpCommandExecution> {
  const { entry, timerId } = await resolveAndStopTimer(arguments_)
  await refreshStoppedTimer(entry, lifecycle)
  return { ok: true, result: { ...getStopTimerResult(entry), timerId, mode: entry.mode } }
}

// Agents lose timer IDs, so a timerId that matches no timer is also tried as a Clockify entry ID.
async function resolveAndStopTimer({ timerId, entryId = timerId }: McpStopTimerArguments) {
  const tracked = timerId ? await db.trackedTimers.get(timerId) : undefined
  if (tracked) {
    // Both IDs may name one timer. Different IDs could stop a second timer when the request is retried.
    if (entryId !== timerId && tracked.entryId !== entryId)
      throw new Error('timerId and entryId name different timers, so nothing was stopped. Pass only one of them.')
    return { timerId: tracked.timerId, entry: await stopTrackedTimer(tracked.timerId) }
  }
  const user = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)
  const workspace = selectClockifyWorkspace(
    user,
    queryClient.getQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces),
  )
  if (!user?.id || !workspace?.id) throw new Error('Clockify account or workspace is not ready. Refresh and try again.')
  const userId = user.id
  const workspaceId = workspace.id
  const stopEntry = async (id: string) => {
    const timer = (await readTrackedTimers(userId)).find(timer => timer.mode === 'clockify' && timer.entryId === id)
    if (timer) return { timerId: timer.timerId, entry: await stopTrackedTimer(timer.timerId) }
    // Only a failed lookup means nothing matched; other failures keep their own reason.
    await clockify.getTimeEntry({ params: { id, workspaceId } }).catch((error: unknown) => {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status !== 400 && status !== 404) throw error
      throw Object.assign(
        new Error(
          `No timer or Clockify entry matches ${id}. No time was added; do not backfill automatically. Call get_tracking_status and use the stopArguments it lists.`,
        ),
        { cause: error },
      )
    })
    const entry = await stopClockifyTimeEntry({ id, userId, workspaceId })
    return { timerId: null, entry: { ...entry, mode: 'clockify' as const, userId, workspaceId } }
  }
  if (entryId) return stopEntry(entryId)

  const running = await getRunningClockifyTimeEntries(userId, workspaceId)
  await retireEndedClockifyTimers(clockify, { userId, workspaceId }, running)
  const timers = (await readTrackedTimers(userId)).filter(timer => timer.state === 'active' && !timer.endedAt)
  const candidates = [
    ...timers.map(timer => ({
      stopArguments: { timerId: timer.timerId },
      callerId: timer.callerId,
      description: timer.body.description ?? '',
      startedAt: timer.startedAt,
    })),
    ...running.flatMap(entry =>
      entry.id && !timers.some(timer => timer.entryId === entry.id)
        ? [
            {
              stopArguments: { entryId: entry.id },
              callerId: null,
              description: entry.description ?? '',
              startedAt: entry.timeInterval?.start ?? null,
            },
          ]
        : [],
    ),
  ]
  const [candidate] = candidates
  if (!candidate) throw new Error('No timer is running. Nothing was stopped.')
  if (candidates.length > 1)
    throw new Error(
      `Several timers are running, so nothing was stopped. Call stop_timer with the stopArguments of the timer to stop: ${JSON.stringify(candidates)}`,
    )
  return 'timerId' in candidate.stopArguments
    ? { timerId: candidate.stopArguments.timerId, entry: await stopTrackedTimer(candidate.stopArguments.timerId) }
    : stopEntry(candidate.stopArguments.entryId)
}

async function getLinearTicket(id: string, viewerId: string | null) {
  if (!viewerId || linearTicketCache.getViewer() !== viewerId) {
    return null
  }

  const syncedTicket = await db.linearTickets.get([viewerId, id])

  return syncedTicket ? toLinearTicket(syncedTicket.ticket) : null
}

async function getGithubWorkItem(id: string) {
  const [item, repositories, visibleWorkItemTypes] = await Promise.all([
    db.githubWorkItems.get(id),
    storage.get('githubSelectedRepositories'),
    storage.get('githubVisibleWorkItemTypes'),
  ])
  if (
    !item ||
    !isGithubItemInScope(item, {
      repositories: repositories.map(repository => repository.fullName),
      visibleWorkItemTypes,
    })
  )
    return null
  return item
}

function getStopTimerResult(entry: TimeEntryWithRatesDtoV1) {
  const entryId = entry.id
  const startedAt = entry.timeInterval?.start
  const endedAt = entry.timeInterval?.end

  if (!entryId || !startedAt || !endedAt) {
    throw new Error('Clockify returned an incomplete stopped entry.')
  }

  return {
    description: entry.description ?? '',
    durationSeconds: getDurationSeconds(startedAt, endedAt),
    endedAt,
    entryId,
    startedAt,
  }
}

function getAddTimeEntryResult(entry: TimeEntryWithRatesDtoV1 | null, project: ClockifyProject): McpAddTimeEntryResult {
  if (!entry?.id || !entry.timeInterval?.start || !entry.timeInterval.end) {
    throw new Error('Clockify returned an incomplete completed entry.')
  }

  return {
    ...getStopTimerResult(entry),
    billable: entry.billable ?? false,
    projectName: project.projectName,
  }
}

function getDurationSeconds(startedAt: string, endedAt: string) {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0
  }

  return Math.max(0, Math.round((end - start) / 1000))
}

function commandError(code: McpCommandErrorCode, message: string): McpCommandExecution {
  return { error: { code, message }, ok: false }
}
