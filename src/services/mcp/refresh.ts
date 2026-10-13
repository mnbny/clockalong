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
import { clockifyTimeEntriesCollection } from '../clockify/sync'
import { githubWorkItemsCollection } from '../github/sync'
import { linearTicketsCollection } from '../linear/sync'
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
    githubWorkItems: githubWorkItemsCollection.toArray,
    linearTickets: linearTicketsCollection.toArray,
    linearViewerId: linearSync?.state.data?.viewerId ?? null,
    runningEntry: runningEntries?.find(entry => entry.userId === user?.id) ?? runningEntries?.[0] ?? null,
    syncedClockifyEntries: clockifyTimeEntriesCollection.toArray,
  })
  await mcp.publishSnapshot(snapshot.capturedAt, snapshot)
  return snapshot
}
