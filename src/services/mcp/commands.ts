import type { TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
import type { SyncedLinearTicket } from '../linear/sync'
import type { LinearTicket } from '../linear/tickets'
import type { ClockifyProject } from '../storage/config'
import type {
  McpCommandPayload,
  McpCommandResult,
  McpStartTimerArguments,
  McpStartTimerResult,
  McpStopTimerResult,
} from '../tauri/mcp-client'

import { queryClient, queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { upsertSyncedClockifyEntry } from '../clockify/sync'
import { stopClockifyTimeEntry } from '../clockify/time-entries'
import { githubWorkItemsCollection } from '../github/sync'
import { formatGithubWorkItemDescription, startClockifyTimerForGithubWorkItem } from '../github/timers'
import { linearTicketsCollection } from '../linear/sync'
import { startClockifyTimerForTicket } from '../linear/timers'
import {
  createQuickTimerTimeEntry,
  persistQuickTimerActiveEntry,
  persistQuickTimerValues,
  resolveQuickTimerValues,
} from '../quick-timers/timers'
import { storage } from '../storage/config'

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
  clockifyTimerProject: ClockifyProject | null
  linearViewerId: string | null
  runningEntry: TimeEntryWithRatesDtoV1 | null
}

const clockifyDisconnectedMessage = 'Clockify is not connected. Connect it in Clockalong before tracking time.'
const missingProjectMessage = 'No Clockify project is selected. Choose a default project in Clockalong settings.'
const unknownTargetMessage = 'No trackable work item matches that id. Call list_trackable_work first.'
const noRunningTimerMessage = 'No Clockify timer is running.'

export async function executeMcpCommand(
  command: McpCommandPayload,
  context: ExecuteMcpCommandContext,
): Promise<McpCommandExecution> {
  if (!context.clockifyConnected) {
    return commandError('clockify_disconnected', clockifyDisconnectedMessage)
  }

  try {
    switch (command.tool) {
      case 'start_timer': {
        const execution = await executeStartTimer(command.arguments, context)
        return execution
      }
      case 'stop_timer': {
        const execution = await executeStopTimer(context)
        return execution
      }
      default:
        return commandError('unsupported_command', `Unsupported MCP command: ${String(command)}`)
    }
  } catch (error) {
    return commandError('clockify_error', getErrorMessage(error))
  }
}

async function executeStartTimer(
  arguments_: McpStartTimerArguments,
  context: ExecuteMcpCommandContext,
): Promise<McpCommandExecution> {
  const project = context.clockifyTimerProject

  if (!project) {
    return commandError('missing_project', missingProjectMessage)
  }

  const billable = await storage.get('clockifyBillable')
  const stoppedPrevious = Boolean(context.runningEntry)
  let entry: TimeEntryWithRatesDtoV1 | null = null

  switch (arguments_.source) {
    case 'linear': {
      const ticket = await getLinearTicket(arguments_.id, context.linearViewerId)

      if (!ticket) {
        return commandError('unknown_target', unknownTargetMessage)
      }

      const [descriptionTemplate, descriptionTemplateFallback] = await Promise.all([
        storage.get('clockifyDescriptionTemplate'),
        storage.get('clockifyDescriptionTemplateFallback'),
      ])
      entry = await startClockifyTimerForTicket({
        billable,
        descriptionTemplate,
        descriptionTemplateFallback,
        projectId: project.projectId,
        ticket,
        workspaceId: project.workspaceId,
      })
      break
    }
    case 'github': {
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
      entry = await startClockifyTimerForGithubWorkItem({
        billable,
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
      entry = await createQuickTimerTimeEntry({ billable, preset, project, values })
      await persistQuickTimerValues({ preset, values })

      if (entry.id) {
        await persistQuickTimerActiveEntry({ entryId: entry.id, quickTimerId: preset.id })
      }
      break
    }
  }

  const result = getStartTimerResult(entry, project, stoppedPrevious)
  invalidateClockifyTimerData()

  return { ok: true, result }
}

async function executeStopTimer(context: ExecuteMcpCommandContext): Promise<McpCommandExecution> {
  const runningEntry = context.runningEntry

  if (!runningEntry) {
    return commandError('no_running_timer', noRunningTimerMessage)
  }

  const stoppedResponse = await stopClockifyTimeEntry(runningEntry)
  const stoppedEntry = {
    ...runningEntry,
    ...stoppedResponse,
    timeInterval: {
      ...runningEntry.timeInterval,
      ...stoppedResponse.timeInterval,
    },
  } satisfies TimeEntryWithRatesDtoV1

  if (runningEntry.userId && runningEntry.workspaceId) {
    try {
      await upsertSyncedClockifyEntry({
        entry: stoppedEntry,
        userId: runningEntry.userId,
        workspaceId: runningEntry.workspaceId,
      })
    } catch (error) {
      console.warn('[mcp command] Could not cache stopped Clockify entry:', error)
    }
  }

  await storage.set('quickTimersActiveEntry', null)
  const result = getStopTimerResult(stoppedEntry)
  invalidateClockifyTimerData()

  return { ok: true, result }
}

async function getLinearTicket(id: string, viewerId: string | null) {
  if (!viewerId) {
    return null
  }

  await linearTicketsCollection.preload()
  const syncedTicket = linearTicketsCollection.toArray.find(ticket => ticket.id === id && ticket.viewerId === viewerId)

  return syncedTicket ? toLinearTicket(syncedTicket) : null
}

function toLinearTicket(syncedTicket: SyncedLinearTicket): LinearTicket {
  return {
    assignee: syncedTicket.ticket.assignee,
    createdAt: syncedTicket.ticket.createdAt,
    id: syncedTicket.ticket.id,
    identifier: syncedTicket.ticket.identifier,
    lastTrackedAt: null,
    status: syncedTicket.ticket.state,
    title: syncedTicket.ticket.title,
    totalTrackedAmount: null,
    totalTrackedAmountCurrency: null,
    totalTrackedSeconds: null,
    updatedAt: syncedTicket.ticket.updatedAt,
    url: syncedTicket.ticket.url,
  }
}

async function getGithubWorkItem(id: string) {
  await githubWorkItemsCollection.preload()
  return githubWorkItemsCollection.toArray.find(item => item.id === id) ?? null
}

function getStartTimerResult(
  entry: TimeEntryWithRatesDtoV1 | null,
  project: ClockifyProject,
  stoppedPrevious: boolean,
): McpStartTimerResult {
  if (!entry?.id || !entry.timeInterval?.start) {
    throw new Error('Clockify returned an incomplete running entry.')
  }

  return {
    billable: entry.billable ?? false,
    description: entry.description ?? '',
    entryId: entry.id,
    projectName: project.projectName,
    startedAt: entry.timeInterval.start,
    stoppedPrevious,
  }
}

function getStopTimerResult(entry: TimeEntryWithRatesDtoV1): McpStopTimerResult {
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

function getDurationSeconds(startedAt: string, endedAt: string) {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0
  }

  return Math.max(0, Math.round((end - start) / 1000))
}

function invalidateClockifyTimerData() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
}

function commandError(code: McpCommandErrorCode, message: string): McpCommandExecution {
  return { error: { code, message }, ok: false }
}
