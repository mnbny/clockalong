import type { ClockifyScope } from '../clockify/entry-cache'
import type {
  ProjectDtoImplV1,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../clockify/generated/reports'
import type { useLinearSync } from '../linear/sync'
import type { McpRefreshResult } from '../tauri/mcp-client'
import type { BuildMcpSnapshotInput, McpTrackableWorkRow } from './snapshot'

import { queryClient, queryKeys } from '../../lib/query-client'
import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { clockifyEntriesInRange, queryClockifySummaries } from '../clockify/entry-queries'
import { getClockifyEntryTableRange } from '../clockify/ranges'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'
import { selectClockifyWorkspace } from '../clockify/workspaces'
import { db } from '../db'
import { isGithubItemInScope } from '../github/work-item-cache'
import { linearTicketsCollection } from '../linear/sync'
import { storage } from '../storage/config'
import { syncProviders } from '../sync'
import { mcp } from '../tauri/mcp-client'
import { buildMcpSnapshot, getScopedLinearTickets } from './snapshot'

type McpCapture = {
  rows: Array<McpTrackableWorkRow & { isClosed: boolean }>
  githubConnected: boolean
  clockifyConnected: boolean
  runningSource: { source: string | null; sourceId: string | null } | null
  scope: ClockifyScope | null
  revision: number
  runningEntry: TimeEntryWithRatesDtoV1 | null
}
const captures = new Map<string, McpCapture>()
let lastCaptureTime = 0
let pendingPublication: Promise<unknown> = Promise.resolve()

export function getMcpCapture(capturedAt: string) {
  return captures.get(capturedAt)
}

export async function refreshMcpSnapshot(getInput: () => BuildMcpSnapshotInput): Promise<McpRefreshResult> {
  const result = await syncProviders()
  const snapshot = await publishMcpSnapshot(getInput())
  return { ...result, capturedAt: snapshot.capturedAt }
}

export function publishMcpSnapshot(
  input: BuildMcpSnapshotInput,
  { deadlineAt = Infinity, signal }: { deadlineAt?: number; signal?: AbortSignal } = {},
) {
  const result = pendingPublication.then(() => captureAndPublish(input, deadlineAt, signal))
  pendingPublication = result.catch(() => {})
  return result
}

async function captureAndPublish(input: BuildMcpSnapshotInput, deadlineAt: number, signal?: AbortSignal) {
  const checkDeadline = () => {
    if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
  }
  checkDeadline()
  // React may still hold the pre-sync state, so capture the current query and collection caches.
  const user = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)
  const workspaces = queryClient.getQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces)
  const workspace = user && selectClockifyWorkspace(user, workspaces)
  const params = { userId: user?.id, workspaceId: workspace?.id }
  const scope =
    input.clockifyConnected && user?.id && workspace?.id ? { userId: user.id, workspaceId: workspace.id } : null
  const runningEntries = queryClient.getQueryData<TimeEntryWithRatesDtoV1[]>(
    queryKeys.clockify.runningEntry({ params }),
  )
  const runningEntry = scope
    ? (runningEntries?.find(entry => entry.userId === user?.id) ?? runningEntries?.[0] ?? null)
    : null
  const linearSync = queryClient
    .getQueryCache()
    .find<
      ReturnType<typeof useLinearSync>['lastSyncResult']
    >({ queryKey: queryKeys.linear.ticketSync(), type: 'active', exact: false })
  const linearViewerId = linearSync?.state.data?.viewerId ?? null
  const linearTickets = linearTicketsCollection.toArray
  const scopedLinearTickets = getScopedLinearTickets({
    connected: Boolean(input.linearConnected),
    syncedTickets: linearTickets,
    viewerId: linearViewerId,
  })
  const now = new Date(Math.max(Date.now(), lastCaptureTime + 1))
  lastCaptureTime = now.getTime()
  const range = getClockifyEntryTableRange(7, now)
  const { revision, recent, linearTimeSummaries } = await db.transaction(
    'r',
    db.clockifyEntries,
    db.clockifyEntryRefs,
    db.clockifyCacheMeta,
    async () => {
      const revision = (await db.clockifyCacheMeta.get('revision'))?.revision ?? 0
      const recent = scope
        ? await clockifyEntriesInRange(db, scope, range.start.toISOString(), range.end.toISOString())
        : []
      const linearTimeSummaries = scope
        ? await queryClockifySummaries(
            db,
            scope,
            scopedLinearTickets,
            ticket => ticket.id,
            getLinearTicketInternalRef,
            runningEntry ? [runningEntry] : [],
            now,
            deadlineAt,
            signal,
          )
        : {}
      return { revision, recent, linearTimeSummaries }
    },
  )
  const refs = [runningEntry, ...recent.map(row => row.entry)]
    .flatMap(entry => parseInternalRefs(entry?.description))
    .filter(ref => ref.provider === 'github')
    .map(ref => normalizeInternalRef(formatInternalRef(ref)))
  const [githubItems, repositories, visibleWorkItemTypes] = input.githubConnected
    ? await Promise.all([
        refs.length
          ? db.githubWorkItems
              .where('refKey')
              .anyOf([...new Set(refs)])
              .toArray()
          : [],
        storage.get('githubSelectedRepositories'),
        storage.get('githubVisibleWorkItemTypes'),
      ])
    : ([[], [], { issues: false, pullRequests: false }] as const)
  const githubScope = { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes }
  const snapshot = buildMcpSnapshot({
    ...input,
    now,
    clockifyProjects: queryClient.getQueryData<ProjectDtoImplV1[]>(
      queryKeys.clockify.projects({ params: { workspaceId: workspace?.id } }),
    ),
    clockifyReports: {
      month: queryClient.getQueryData<TimeEntrySummaryReportDto>(
        queryKeys.clockify.summaryReport({ params: { ...params, period: 'month' } }),
      ),
      today: queryClient.getQueryData<TimeEntrySummaryReportDto>(
        queryKeys.clockify.summaryReport({ params: { ...params, period: 'today' } }),
      ),
      week: queryClient.getQueryData<TimeEntrySummaryReportDto>(
        queryKeys.clockify.summaryReport({ params: { ...params, period: 'week' } }),
      ),
    },
    clockifyUserId: user?.id,
    clockifyWorkspaceId: workspace?.id,
    clockifyWorkspaceName: workspace?.name ?? null,
    githubWorkItems: githubItems.filter(item => isGithubItemInScope(item, githubScope)),
    linearTickets,
    linearViewerId,
    linearTimeSummaries,
    runningEntry,
    syncedClockifyEntries: recent.filter(row => row.id !== runningEntry?.id),
  })
  checkDeadline()
  captures.set(snapshot.capturedAt, {
    rows: snapshot.trackableWork,
    githubConnected: snapshot.trackingStatus.githubConnected,
    clockifyConnected: snapshot.trackingStatus.clockifyConnected,
    runningSource: snapshot.trackingStatus.running
      ? { source: snapshot.trackingStatus.running.source, sourceId: snapshot.trackingStatus.running.sourceId }
      : null,
    scope,
    revision,
    runningEntry: runningEntry
      ? {
          id: runningEntry.id,
          description: runningEntry.description,
          timeInterval: runningEntry.timeInterval,
          hourlyRate: runningEntry.hourlyRate,
        }
      : null,
  })
  while (captures.size > 20) captures.delete(captures.keys().next().value!)
  try {
    await mcp.publishSnapshot(snapshot.capturedAt, { ...snapshot, githubTracking: [] })
    checkDeadline()
  } catch (error) {
    captures.delete(snapshot.capturedAt)
    throw error
  }
  return snapshot
}
