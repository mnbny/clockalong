import type {
  ProjectDtoImplV1,
  TimeEntryWithRatesDtoV1,
  UserDtoV1,
  WorkspaceDtoV1,
} from '../clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../clockify/generated/reports'
import type { useLinearSync } from '../linear/sync'
import type { McpRefreshResult } from '../tauri/mcp-client'
import type { BuildMcpSnapshotInput } from './snapshot'

import { queryClient, queryKeys } from '../../lib/query-client'
import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { clockifyTimeEntriesCollection } from '../clockify/sync'
import { db } from '../db'
import { isGithubItemInScope } from '../github/work-item-cache'
import { linearTicketsCollection } from '../linear/sync'
import { storage } from '../storage/config'
import { syncProviders } from '../sync'
import { mcp } from '../tauri/mcp-client'
import { buildMcpSnapshot } from './snapshot'

export async function refreshMcpSnapshot(getInput: () => BuildMcpSnapshotInput): Promise<McpRefreshResult> {
  const result = await syncProviders()
  const snapshot = await publishMcpSnapshot(getInput())
  return { ...result, capturedAt: snapshot.capturedAt }
}

export async function publishMcpSnapshot(input: BuildMcpSnapshotInput) {
  // Read caches directly: React's live-query render may still contain the pre-sync rows.
  const user = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)
  const workspaces = queryClient.getQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces)
  const workspace =
    user &&
    (workspaces?.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces?.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces?.[0])
  const params = { userId: user?.id, workspaceId: workspace?.id }
  const runningEntries = queryClient.getQueryData<TimeEntryWithRatesDtoV1[]>(
    queryKeys.clockify.runningEntry({ params }),
  )
  const linearSync = queryClient.getQueryCache().find<ReturnType<typeof useLinearSync>['lastSyncResult']>({
    queryKey: queryKeys.linear.ticketSync(),
    type: 'active',
    exact: false,
  })
  const syncedClockifyEntries = clockifyTimeEntriesCollection.toArray
  const runningEntry = runningEntries?.find(entry => entry.userId === user?.id) ?? runningEntries?.[0] ?? null
  const refs = [runningEntry, ...syncedClockifyEntries.map(row => row.entry)]
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
  const scope = { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes }
  const snapshot = buildMcpSnapshot({
    ...input,
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
    githubWorkItems: githubItems.filter(item => isGithubItemInScope(item, scope)),
    linearTickets: linearTicketsCollection.toArray,
    linearViewerId: linearSync?.state.data?.viewerId ?? null,
    runningEntry,
    syncedClockifyEntries,
  })
  const githubTracking = snapshot.trackableWork
    .filter(row => row.source === 'github')
    .map(({ id, isRunning, lastTrackedAt, totalTrackedAmount, totalTrackedAmountCurrency, totalTrackedSeconds }) => ({
      id,
      isRunning,
      lastTrackedAt,
      totalTrackedAmount,
      totalTrackedAmountCurrency,
      totalTrackedSeconds,
    }))
  snapshot.trackableWork = snapshot.trackableWork.filter(row => row.source !== 'github')
  await mcp.publishSnapshot(snapshot.capturedAt, { ...snapshot, githubTracking })
  return snapshot
}
