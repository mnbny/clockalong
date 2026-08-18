import type { ProjectDtoImplV1, TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../clockify/generated/reports'
import type { SyncedClockifyTimeEntry } from '../clockify/sync'
import type { SyncedGithubWorkItem } from '../github/sync'
import type { SyncedLinearTicket } from '../linear/sync'
import type { LinearTicket } from '../linear/tickets'
import type {
  ClockifyProject,
  QuickTimerPreset,
  QuickTimersActiveEntry,
  QuickTimersCacheEntry,
} from '../storage/config'

import { parseTemplateTokens } from '../../utils/templates'
import {
  getClockifyEntryLinearTicket,
  getLinearTicketInternalRef,
  summarizeClockifyTicketTimeEntries,
} from '../clockify/ticket-summaries'
import {
  getClockifyEntryGithubWorkItem,
  getGithubWorkItemInternalRef,
  summarizeClockifyGithubWorkItemTimeEntries,
} from '../github/work-item-summaries'
import { isLinearTicketTerminal } from '../linear/tickets-sorting'

export type McpWorkSource = 'github' | 'linear' | 'quick_timer'

export type McpTrackableWorkRow = {
  id: string
  identifier: string | null
  internalRef: string | null
  isRunning: boolean
  lastTrackedAt: string | null
  repository: string | null
  requiredVariables?: Array<{
    cachedValue: string | null
    name: string
  }>
  source: McpWorkSource
  status: string | null
  title: string
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number
  updatedAt: string | null
  url: string | null
}

export type McpPeriodTotals = {
  amount: number
  currency: string
  trackedSeconds: number
}

export type McpRunningEntry = {
  billable: boolean
  description: string
  elapsedSeconds: number
  entryId: string
  projectName: string | null
  source: McpWorkSource | null
  sourceId: string | null
  startedAt: string
}

export type McpTrackingStatus = {
  capturedAt: string
  clockifyConnected: boolean
  githubConnected: boolean
  linearConnected: boolean
  month: McpPeriodTotals
  projectName: string | null
  running: McpRunningEntry | null
  today: McpPeriodTotals
  week: McpPeriodTotals
  workspaceName: string | null
}

export type McpRecentEntry = {
  billable: boolean
  description: string
  durationSeconds: number
  endedAt: string
  entryId: string
  projectName: string | null
  source: McpWorkSource | null
  sourceId: string | null
  startedAt: string
}

export type McpRecentEntries = Record<'1' | '3' | '7', McpRecentEntry[]>

export type McpClockifyProjects = {
  activeProject: {
    projectId: string
    projectName: string
  } | null
  projects: Array<{
    billable: boolean
    projectId: string
    projectName: string
  }>
  workspaceName: string | null
}

export type McpSnapshot = {
  capturedAt: string
  clockifyProjects: McpClockifyProjects
  recentEntries: McpRecentEntries
  trackingStatus: McpTrackingStatus
  trackableWork: Array<McpTrackableWorkRow & { isClosed: boolean }>
}

export type BuildMcpSnapshotInput = {
  clockifyConnected?: boolean
  clockifyProjects?: ProjectDtoImplV1[]
  clockifyReports?: {
    month?: TimeEntrySummaryReportDto
    today?: TimeEntrySummaryReportDto
    week?: TimeEntrySummaryReportDto
  }
  clockifyTimerProject?: ClockifyProject | null
  clockifyUserId?: string
  clockifyWorkspaceId?: string
  clockifyWorkspaceName?: string | null
  githubConnected?: boolean
  githubWorkItems?: SyncedGithubWorkItem[]
  linearConnected?: boolean
  linearTickets?: SyncedLinearTicket[]
  linearViewerId?: string | null
  now?: Date
  quickTimers?: QuickTimerPreset[]
  quickTimersActiveEntry?: QuickTimersActiveEntry
  quickTimersCache?: QuickTimersCacheEntry[]
  quickTimersEnabled?: boolean
  runningEntry?: TimeEntryWithRatesDtoV1 | null
  syncedClockifyEntries?: SyncedClockifyTimeEntry[]
}

const emptyTimeSummary = {
  lastTrackedAt: null,
  totalTrackedAmount: null,
  totalTrackedAmountCurrency: null,
  totalTrackedSeconds: 0,
}

export function buildMcpSnapshot({
  clockifyConnected = false,
  clockifyProjects = [],
  clockifyReports = {},
  clockifyTimerProject = null,
  clockifyUserId,
  clockifyWorkspaceId,
  clockifyWorkspaceName = null,
  githubConnected = false,
  githubWorkItems = [],
  linearConnected = false,
  linearTickets = [],
  linearViewerId = null,
  now = new Date(),
  quickTimers = [],
  quickTimersActiveEntry = null,
  quickTimersCache = [],
  quickTimersEnabled = false,
  runningEntry = null,
  syncedClockifyEntries = [],
}: BuildMcpSnapshotInput = {}): McpSnapshot {
  const capturedAt = now.toISOString()
  const scopedLinearTickets = getScopedLinearTickets({
    connected: linearConnected,
    syncedTickets: linearTickets,
    viewerId: linearViewerId,
  })
  const scopedGithubWorkItems = githubConnected ? githubWorkItems : []
  const scopedQuickTimers = quickTimersEnabled ? quickTimers : []
  const scopedRunningEntry = clockifyConnected ? runningEntry : null
  const scopedSyncedEntries = getScopedClockifyEntries({
    connected: clockifyConnected,
    entries: syncedClockifyEntries,
    userId: clockifyUserId,
    workspaceId: clockifyWorkspaceId,
  })
  const summaryEntries = [
    ...scopedSyncedEntries.map(syncedEntry => syncedEntry.entry),
    ...(scopedRunningEntry ? [scopedRunningEntry] : []),
  ]
  const linearSummaries = summarizeClockifyTicketTimeEntries({
    entries: summaryEntries,
    now,
    tickets: scopedLinearTickets,
  })
  const githubSummaries = summarizeClockifyGithubWorkItemTimeEntries({
    entries: summaryEntries,
    now,
    workItems: scopedGithubWorkItems,
  })
  const runningSource = resolveEntrySource({
    entry: scopedRunningEntry,
    githubWorkItems: scopedGithubWorkItems,
    linearTickets: scopedLinearTickets,
    quickTimers: scopedQuickTimers,
    quickTimersActiveEntry,
  })
  const projectNames = new Map([
    ...clockifyProjects.flatMap(project => (project.id && project.name ? [[project.id, project.name] as const] : [])),
    ...(clockifyTimerProject ? ([[clockifyTimerProject.projectId, clockifyTimerProject.projectName]] as const) : []),
  ])
  const trackableWork = [
    ...scopedLinearTickets.map(ticket => {
      const summary = linearSummaries[ticket.id] ?? emptyTimeSummary

      return {
        id: ticket.id,
        identifier: ticket.identifier,
        internalRef: getLinearTicketInternalRef(ticket),
        isClosed: isLinearTicketTerminal(ticket),
        isRunning: runningSource.source === 'linear' && runningSource.sourceId === ticket.id,
        lastTrackedAt: summary.lastTrackedAt,
        repository: null,
        source: 'linear',
        status: ticket.status.name,
        title: ticket.title,
        totalTrackedAmount: summary.totalTrackedAmount,
        totalTrackedAmountCurrency: summary.totalTrackedAmountCurrency,
        totalTrackedSeconds: summary.totalTrackedSeconds,
        updatedAt: ticket.updatedAt,
        url: ticket.url,
      } satisfies McpTrackableWorkRow & { isClosed: boolean }
    }),
    ...scopedGithubWorkItems.map(workItem => {
      const summary = githubSummaries[workItem.id] ?? emptyTimeSummary

      return {
        id: workItem.id,
        identifier: `${workItem.type === 'pullRequest' ? 'PR' : 'Issue'}#${workItem.number}`,
        internalRef: getGithubWorkItemInternalRef(workItem),
        isClosed: workItem.state.toLowerCase() === 'closed',
        isRunning: runningSource.source === 'github' && runningSource.sourceId === workItem.id,
        lastTrackedAt: summary.lastTrackedAt,
        repository: workItem.repositoryFullName,
        source: 'github',
        status: workItem.state,
        title: workItem.title,
        totalTrackedAmount: summary.totalTrackedAmount,
        totalTrackedAmountCurrency: summary.totalTrackedAmountCurrency,
        totalTrackedSeconds: summary.totalTrackedSeconds,
        updatedAt: workItem.updatedAt,
        url: workItem.url,
      } satisfies McpTrackableWorkRow & { isClosed: boolean }
    }),
    ...scopedQuickTimers.map(
      preset =>
        ({
          id: preset.id,
          identifier: null,
          internalRef: null,
          isClosed: false,
          isRunning: runningSource.source === 'quick_timer' && runningSource.sourceId === preset.id,
          lastTrackedAt: null,
          repository: null,
          requiredVariables: getQuickTimerRequiredVariables(preset, quickTimersCache),
          source: 'quick_timer',
          status: null,
          title: preset.name,
          totalTrackedAmount: null,
          totalTrackedAmountCurrency: null,
          totalTrackedSeconds: 0,
          updatedAt: null,
          url: null,
        }) satisfies McpTrackableWorkRow & { isClosed: boolean },
    ),
  ]
  const trackingStatus = {
    capturedAt,
    clockifyConnected,
    githubConnected,
    linearConnected,
    month: getClockifyReportTotals(clockifyConnected ? clockifyReports.month : undefined),
    projectName: clockifyConnected ? (clockifyTimerProject?.projectName ?? null) : null,
    running: getRunningEntry({
      entry: scopedRunningEntry,
      now,
      projectNames,
      source: runningSource,
    }),
    today: getClockifyReportTotals(clockifyConnected ? clockifyReports.today : undefined),
    week: getClockifyReportTotals(clockifyConnected ? clockifyReports.week : undefined),
    workspaceName: clockifyConnected ? clockifyWorkspaceName : null,
  } satisfies McpTrackingStatus

  return {
    capturedAt,
    clockifyProjects: getClockifyProjects({
      connected: clockifyConnected,
      projects: clockifyProjects,
      timerProject: clockifyTimerProject,
      workspaceId: clockifyWorkspaceId,
      workspaceName: clockifyWorkspaceName,
    }),
    recentEntries: {
      '1': getRecentEntries({
        days: 1,
        entries: scopedSyncedEntries,
        githubWorkItems: scopedGithubWorkItems,
        linearTickets: scopedLinearTickets,
        now,
        projectNames,
        quickTimers: scopedQuickTimers,
        quickTimersActiveEntry,
      }),
      '3': getRecentEntries({
        days: 3,
        entries: scopedSyncedEntries,
        githubWorkItems: scopedGithubWorkItems,
        linearTickets: scopedLinearTickets,
        now,
        projectNames,
        quickTimers: scopedQuickTimers,
        quickTimersActiveEntry,
      }),
      '7': getRecentEntries({
        days: 7,
        entries: scopedSyncedEntries,
        githubWorkItems: scopedGithubWorkItems,
        linearTickets: scopedLinearTickets,
        now,
        projectNames,
        quickTimers: scopedQuickTimers,
        quickTimersActiveEntry,
      }),
    },
    trackingStatus,
    trackableWork,
  }
}

function getScopedLinearTickets({
  connected,
  syncedTickets,
  viewerId,
}: {
  connected: boolean
  syncedTickets: SyncedLinearTicket[]
  viewerId: string | null
}) {
  if (!connected || !viewerId) {
    return []
  }

  return syncedTickets.filter(ticket => ticket.viewerId === viewerId).map(ticket => toLinearTicket(ticket))
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

function getScopedClockifyEntries({
  connected,
  entries,
  userId,
  workspaceId,
}: {
  connected: boolean
  entries: SyncedClockifyTimeEntry[]
  userId: string | undefined
  workspaceId: string | undefined
}) {
  if (!connected || !userId || !workspaceId) {
    return []
  }

  return entries.filter(entry => entry.userId === userId && entry.workspaceId === workspaceId)
}

function resolveEntrySource({
  entry,
  githubWorkItems,
  linearTickets,
  quickTimers,
  quickTimersActiveEntry,
}: {
  entry: TimeEntryWithRatesDtoV1 | null
  githubWorkItems: SyncedGithubWorkItem[]
  linearTickets: LinearTicket[]
  quickTimers: QuickTimerPreset[]
  quickTimersActiveEntry: QuickTimersActiveEntry
}): { source: McpWorkSource | null; sourceId: string | null } {
  const linearTicket = getClockifyEntryLinearTicket(entry, linearTickets)

  if (linearTicket) {
    return { source: 'linear', sourceId: linearTicket.id }
  }

  const githubWorkItem = getClockifyEntryGithubWorkItem(entry, githubWorkItems)

  if (githubWorkItem) {
    return { source: 'github', sourceId: githubWorkItem.id }
  }

  const quickTimer =
    entry?.id && entry.id === quickTimersActiveEntry?.entryId
      ? quickTimers.find(preset => preset.id === quickTimersActiveEntry.quickTimerId)
      : null

  return quickTimer ? { source: 'quick_timer', sourceId: quickTimer.id } : { source: null, sourceId: null }
}

function getQuickTimerRequiredVariables(preset: QuickTimerPreset, cache: QuickTimersCacheEntry[]) {
  const cachedValues = cache.find(entry => entry.id === preset.id)

  return parseTemplateTokens(preset.descriptionTemplate).map(name => ({
    cachedValue: getQuickTimerCachedValue(cachedValues, name),
    name,
  }))
}

function getQuickTimerCachedValue(cachedValues: QuickTimersCacheEntry | undefined, name: string) {
  const value = cachedValues?.values?.[name] ?? (cachedValues as Record<string, unknown> | undefined)?.[name]
  return typeof value === 'string' ? value : null
}

function getClockifyReportTotals(report: TimeEntrySummaryReportDto | undefined): McpPeriodTotals {
  const totals = report?.totals ?? []

  return {
    amount: totals.reduce((total, entryTotal) => {
      const earned = entryTotal.amounts?.find(amount => amount.type === 'EARNED')
      return total + (earned?.value ?? 0) / 100
    }, 0),
    currency: 'USD',
    trackedSeconds: totals.reduce((total, entryTotal) => total + (entryTotal.totalTime ?? 0), 0),
  }
}

function getRunningEntry({
  entry,
  now,
  projectNames,
  source,
}: {
  entry: TimeEntryWithRatesDtoV1 | null
  now: Date
  projectNames: Map<string, string>
  source: { source: McpWorkSource | null; sourceId: string | null }
}): McpRunningEntry | null {
  const entryId = entry?.id
  const startedAt = entry?.timeInterval?.start
  const startedAtTime = startedAt ? Date.parse(startedAt) : Number.NaN

  if (!entryId || !startedAt || !Number.isFinite(startedAtTime)) {
    return null
  }

  return {
    billable: entry.billable ?? false,
    description: entry.description ?? '',
    elapsedSeconds: Math.max(0, Math.floor((now.getTime() - startedAtTime) / 1000)),
    entryId,
    projectName: entry.projectId ? (projectNames.get(entry.projectId) ?? null) : null,
    source: source.source,
    sourceId: source.sourceId,
    startedAt,
  }
}

function getRecentEntries({
  days,
  entries,
  githubWorkItems,
  linearTickets,
  now,
  projectNames,
  quickTimers,
  quickTimersActiveEntry,
}: {
  days: 1 | 3 | 7
  entries: SyncedClockifyTimeEntry[]
  githubWorkItems: SyncedGithubWorkItem[]
  linearTickets: LinearTicket[]
  now: Date
  projectNames: Map<string, string>
  quickTimers: QuickTimerPreset[]
  quickTimersActiveEntry: QuickTimersActiveEntry
}) {
  const range = getRecentEntryRange(days, now)

  return entries
    .filter(entry => {
      const startedAt = Date.parse(entry.startedAt)
      return (
        Number.isFinite(startedAt) &&
        startedAt >= range.start.getTime() &&
        startedAt < range.end.getTime() &&
        Boolean(entry.entry.timeInterval?.end)
      )
    })
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt))
    .map(syncedEntry => {
      const entry = syncedEntry.entry
      const startedAt = entry.timeInterval?.start ?? syncedEntry.startedAt
      const endedAt = entry.timeInterval?.end ?? startedAt
      const source = resolveEntrySource({
        entry,
        githubWorkItems,
        linearTickets,
        quickTimers,
        quickTimersActiveEntry,
      })

      return {
        billable: entry.billable ?? false,
        description: entry.description ?? '',
        durationSeconds: getDurationSeconds(startedAt, endedAt),
        endedAt,
        entryId: syncedEntry.id,
        projectName: entry.projectId ? (projectNames.get(entry.projectId) ?? null) : null,
        source: source.source,
        sourceId: source.sourceId,
        startedAt,
      } satisfies McpRecentEntry
    })
}

function getRecentEntryRange(days: number, now: Date) {
  const start = getDayStart(now)
  const end = getDayStart(now)

  start.setDate(start.getDate() - (days - 1))
  end.setDate(end.getDate() + 1)

  return { end, start }
}

function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDurationSeconds(startedAt: string, endedAt: string) {
  const start = Date.parse(startedAt)
  const end = Date.parse(endedAt)

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0
  }

  return Math.max(0, Math.round((end - start) / 1000))
}

function getClockifyProjects({
  connected,
  projects,
  timerProject,
  workspaceId,
  workspaceName,
}: {
  connected: boolean
  projects: ProjectDtoImplV1[]
  timerProject: ClockifyProject | null
  workspaceId: string | undefined
  workspaceName: string | null
}): McpClockifyProjects {
  if (!connected) {
    return { activeProject: null, projects: [], workspaceName: null }
  }

  return {
    activeProject: timerProject
      ? {
          projectId: timerProject.projectId,
          projectName: timerProject.projectName,
        }
      : null,
    projects: projects.flatMap(project => {
      if (
        !project.id ||
        !project.name ||
        project.archived ||
        (workspaceId && project.workspaceId && project.workspaceId !== workspaceId)
      ) {
        return []
      }

      return {
        billable: project.billable ?? false,
        projectId: project.id,
        projectName: project.name,
      }
    }),
    workspaceName,
  }
}
