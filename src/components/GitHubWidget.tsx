import { IconBrandGithub, IconExternalLink, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import { and, eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useMemo } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../services/clockify/generated/clockify'
import { clockifyTimeEntriesCollection } from '../services/clockify/sync'
import { createGithubClient } from '../services/github/client'
import {
  formatGithubIssueDescriptionTemplate,
  formatGithubPullRequestDescriptionTemplate,
  type GithubIssueDescriptionTemplateValues,
  type GithubPullRequestDescriptionTemplateValues,
} from '../services/github/description-template'
import { githubWorkItemsCollection, type SyncedGithubWorkItem, useGithubSync } from '../services/github/sync'
import {
  getClockifyEntryGithubWorkItem,
  getGithubWorkItemInternalRef,
  type GithubWorkItemWithTracking,
  mergeGithubWorkItemTimeSummaries,
  summarizeClockifyGithubWorkItemTimeEntries,
} from '../services/github/work-item-summaries'
import { useStorage } from '../services/storage/useStorage'
import { getErrorMessage } from '../utils/errors'
import { internalRefTemplateToken, parseInternalRefs } from '../utils/templates'
import { appToast } from './AppToaster'
import { LastTrackedCell, TotalTrackedAmountCell, TotalTrackedCell } from './TrackingSummaryCells'

type GithubWorkItemTableMeta = {
  activeGithubWorkItemId: string | null
  onStartTracking: (workItem: SyncedGithubWorkItem) => void
  onStopTracking: (workItem: SyncedGithubWorkItem) => void
  pendingWorkItemId: string | null | undefined
  stoppingWorkItemId: string | null | undefined
}

const githubWorkItemColumns: Array<ColumnDef<GithubWorkItemWithTracking>> = [
  {
    id: 'trackingAction',
    header: () => <span className="sr-only">Time tracking</span>,
    cell: info => {
      const meta = getGithubWorkItemTableMeta(info.table.options.meta)
      const workItem = info.row.original

      return (
        <StartTrackingButton
          active={meta.activeGithubWorkItemId === workItem.id}
          pending={meta.pendingWorkItemId === workItem.id}
          stopping={meta.stoppingWorkItemId === workItem.id}
          workItem={workItem}
          onStartTracking={meta.onStartTracking}
          onStopTracking={meta.onStopTracking}
        />
      )
    },
  },
  {
    id: 'identifier',
    header: 'ID',
    cell: info => <span className="font-mono text-sm font-bold">{getGithubWorkItemLabel(info.row.original)}</span>,
  },
  {
    accessorKey: 'repositoryFullName',
    header: 'Repository',
    cell: info => (
      <span className="relative -top-0.5 block min-w-0 truncate font-mono" title={info.getValue<string>()}>
        {getGithubRepositoryName(info.getValue<string>())}
      </span>
    ),
  },
  {
    id: 'author',
    header: () => <span className="sr-only">Author</span>,
    cell: info => <AuthorAvatar item={info.row.original} />,
  },
  {
    accessorKey: 'title',
    header: 'Item',
    cell: info => (
      <span className="block min-w-0 truncate font-medium" title={info.getValue<string>()}>
        {info.getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: 'lastTrackedAt',
    header: 'Tracked',
    cell: info => <LastTrackedCell lastTrackedAt={info.getValue<string | null>()} />,
  },
  {
    accessorKey: 'totalTrackedSeconds',
    header: 'Total',
    cell: info => <TotalTrackedCell totalTrackedSeconds={info.getValue<number | null>()} />,
  },
  {
    accessorKey: 'totalTrackedAmount',
    header: 'Value',
    cell: info => {
      const workItem = info.row.original

      return (
        <TotalTrackedAmountCell
          totalTrackedAmount={info.getValue<number | null>()}
          totalTrackedAmountCurrency={workItem.totalTrackedAmountCurrency}
        />
      )
    },
  },
  {
    id: 'externalLink',
    header: () => <span className="sr-only">Open</span>,
    cell: info => {
      const workItem = info.row.original

      return (
        <a
          className="btn btn-square btn-ghost text-primary hover:bg-primary/10 btn-sm"
          href={workItem.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Open ${getGithubWorkItemLabel(workItem)} in GitHub`}>
          <IconExternalLink className="size-4" />
        </a>
      )
    },
  },
]

const githubWorkItemTableCoreRowModel = getCoreRowModel<GithubWorkItemWithTracking>()

export function GitHubWidget() {
  const authState = useAppAuth()
  const githubAuthenticated = authState.value.githubAuthenticated && !authState.loading

  if (!githubAuthenticated) {
    return null
  }

  return <GitHubWidgetContent />
}

function GitHubWidgetContent() {
  const queryClient = useQueryClient()
  const [clockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [githubIssueDescriptionTemplate] = useStorage('githubIssueDescriptionTemplate')
  const [githubIssueDescriptionTemplateFallback] = useStorage('githubIssueDescriptionTemplateFallback')
  const [githubPullRequestDescriptionTemplate] = useStorage('githubPullRequestDescriptionTemplate')
  const [githubPullRequestDescriptionTemplateFallback] = useStorage('githubPullRequestDescriptionTemplateFallback')
  const [githubAuthoredWorkItemsOnly, setGithubAuthoredWorkItemsOnly] = useStorage('githubAuthoredWorkItemsOnly')
  const [githubShowClosedWorkItems, setGithubShowClosedWorkItems] = useStorage('githubShowClosedWorkItems')
  const githubSync = useGithubSync()
  const {
    queries: { syncQuery },
    syncing,
    syncNow,
  } = githubSync
  const syncedWorkItemsQuery = useLiveQuery(q =>
    q.from({ syncedWorkItem: githubWorkItemsCollection }).orderBy(({ syncedWorkItem }) => syncedWorkItem.updatedAt),
  )
  const githubViewerQuery = useQuery({
    enabled: githubAuthoredWorkItemsOnly,
    queryKey: queryKeys.github.viewer,
    queryFn: async () => {
      const github = await createGithubClient()
      const response = await github.rest.users.getAuthenticated()

      return response.data
    },
    staleTime: 5 * 60_000,
  })
  const githubViewerLogin = githubAuthoredWorkItemsOnly ? githubViewerQuery.data?.login : null
  const workItems = useMemo(
    () =>
      (syncedWorkItemsQuery.data ?? [])
        .filter(item => !githubAuthoredWorkItemsOnly || item.author === githubViewerLogin)
        .filter(item => githubShowClosedWorkItems || item.state !== 'closed')
        .map(row => row)
        .sort(compareGithubWorkItems),
    [githubAuthoredWorkItemsOnly, githubShowClosedWorkItems, githubViewerLogin, syncedWorkItemsQuery.data],
  )
  const clockifyUserQuery = useQuery({
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    staleTime: 5 * 60_000,
  })
  const clockifyWorkspacesQuery = useQuery({
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    staleTime: 5 * 60_000,
  })
  const selectedClockifyWorkspace = useMemo(() => {
    const user = clockifyUserQuery.data
    const workspaces = clockifyWorkspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
  }, [clockifyUserQuery.data, clockifyWorkspacesQuery.data])
  const runningEntryQuery = useQuery({
    enabled: Boolean(clockifyUserQuery.data?.id && selectedClockifyWorkspace?.id),
    queryKey: queryKeys.clockify.runningEntry({
      params: { userId: clockifyUserQuery.data?.id, workspaceId: selectedClockifyWorkspace?.id },
    }),
    queryFn: () =>
      clockify.getTimeEntries({
        params: { workspaceId: selectedClockifyWorkspace!.id!, userId: clockifyUserQuery.data!.id! },
        queries: {
          hydrated: true,
          'in-progress': 'true',
          page: 1,
          'page-size': 1,
        },
      }),
    refetchInterval: 15 * 60_000,
    staleTime: 60_000,
  })
  const runningEntry = useMemo(() => {
    const runningEntries = runningEntryQuery.data ?? []
    return runningEntries.find(entry => entry.userId === clockifyUserQuery.data?.id) ?? runningEntries[0] ?? null
  }, [clockifyUserQuery.data?.id, runningEntryQuery.data])
  const syncedTimeEntriesQuery = useLiveQuery(
    q => {
      if (!clockifyUserQuery.data?.id || !selectedClockifyWorkspace?.id) {
        return null
      }

      return q
        .from({ syncedEntry: clockifyTimeEntriesCollection })
        .where(({ syncedEntry }) =>
          and(
            eq(syncedEntry.userId, clockifyUserQuery.data.id!),
            eq(syncedEntry.workspaceId, selectedClockifyWorkspace.id!),
          ),
        )
        .orderBy(({ syncedEntry }) => syncedEntry.startedAt)
    },
    [clockifyUserQuery.data?.id, selectedClockifyWorkspace?.id],
  )
  const workItemTimeSummaries = useMemo(() => {
    return summarizeClockifyGithubWorkItemTimeEntries({
      entries: [
        ...(syncedTimeEntriesQuery.data?.map(syncedEntry => syncedEntry.entry) ?? []),
        ...(runningEntryQuery.data ?? []),
      ],
      workItems,
    })
  }, [runningEntryQuery.data, syncedTimeEntriesQuery.data, workItems])
  useEffect(() => {
    githubWidgetLog('clockify summary inputs', {
      githubWorkItemCount: workItems.length,
      runningEntryCount: runningEntryQuery.data?.length ?? 0,
      sampleSyncedEntries: summarizeGithubWidgetSyncedEntries(syncedTimeEntriesQuery.data ?? []),
      summaryCount: Object.keys(workItemTimeSummaries).length,
      syncedEntryCount: syncedTimeEntriesQuery.data?.length ?? 0,
      userId: clockifyUserQuery.data?.id,
      workspaceId: selectedClockifyWorkspace?.id,
    })
  }, [
    clockifyUserQuery.data?.id,
    runningEntryQuery.data,
    selectedClockifyWorkspace?.id,
    syncedTimeEntriesQuery.data,
    workItemTimeSummaries,
    workItems.length,
  ])
  const workItemsWithTracking = useMemo(
    () => mergeGithubWorkItemTimeSummaries(workItems, workItemTimeSummaries),
    [workItemTimeSummaries, workItems],
  )
  const workItemDescriptions = useMemo(
    () =>
      new Map(
        workItemsWithTracking.map(item => [
          item.id,
          formatGithubWorkItemDescription({
            item,
            issueTemplate: githubIssueDescriptionTemplate,
            issueTemplateFallback: githubIssueDescriptionTemplateFallback,
            pullRequestTemplate: githubPullRequestDescriptionTemplate,
            pullRequestTemplateFallback: githubPullRequestDescriptionTemplateFallback,
          }),
        ]),
      ),
    [
      githubIssueDescriptionTemplate,
      githubIssueDescriptionTemplateFallback,
      githubPullRequestDescriptionTemplate,
      githubPullRequestDescriptionTemplateFallback,
      workItemsWithTracking,
    ],
  )
  const activeGithubWorkItemId = getClockifyEntryGithubWorkItem(runningEntry, workItemsWithTracking)?.id ?? null
  const startTrackingMutation = useMutation({
    mutationFn: async (item: SyncedGithubWorkItem) => {
      if (!clockifyDefaultProject) {
        throw new MissingClockifyDefaultProjectError()
      }

      const entry = await startClockifyTimerForGithubWorkItem({
        billable: clockifyBillable,
        description: workItemDescriptions.get(item.id) ?? '',
        item,
        workspaceId: clockifyDefaultProject.workspaceId,
        projectId: clockifyDefaultProject.projectId,
      })

      return { entry, item }
    },
    onError: error => {
      if (error instanceof MissingClockifyDefaultProjectError) {
        appToast.warning('Choose a default Clockify project first', {
          description: 'Open settings and select the project to track time against.',
        })
        return
      }

      appToast.error('Could not start Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: ({ item }) => {
      appToast.success(`Started timer for ${getGithubWorkItemLabel(item)}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })
  const stopTrackingMutation = useMutation({
    mutationFn: async (item: SyncedGithubWorkItem) => {
      if (!runningEntry) {
        throw new MissingRunningClockifyEntryError()
      }

      return stopClockifyTimerForEntry({ entry: runningEntry, item })
    },
    onError: error => {
      if (error instanceof MissingRunningClockifyEntryError) {
        appToast.warning('No Clockify timer is running')
        return
      }

      appToast.error('Could not stop Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: (_, item) => {
      appToast.success(`Stopped timer for ${getGithubWorkItemLabel(item)}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })
  const pendingWorkItemId = startTrackingMutation.isPending ? startTrackingMutation.variables?.id : null
  const stoppingWorkItemId = stopTrackingMutation.isPending ? stopTrackingMutation.variables?.id : null
  const handleStartTracking = useCallback(
    (item: SyncedGithubWorkItem) => {
      startTrackingMutation.mutate(item)
    },
    [startTrackingMutation],
  )
  const handleStopTracking = useCallback(
    (item: SyncedGithubWorkItem) => {
      stopTrackingMutation.mutate(item)
    },
    [stopTrackingMutation],
  )
  const refreshWorkItems = useCallback(() => {
    void Promise.all([
      syncNow(),
      queryClient.refetchQueries({ queryKey: queryKeys.clockify.runningEntry() }),
      queryClient.refetchQueries({ queryKey: queryKeys.clockify.entrySync() }),
    ])
  }, [queryClient, syncNow])
  const table = useReactTable({
    data: workItemsWithTracking,
    columns: githubWorkItemColumns,
    getCoreRowModel: githubWorkItemTableCoreRowModel,
    meta: {
      activeGithubWorkItemId,
      onStartTracking: handleStartTracking,
      onStopTracking: handleStopTracking,
      pendingWorkItemId,
      stoppingWorkItemId,
    } satisfies GithubWorkItemTableMeta,
  })

  return (
    <section className="card card-border bg-base-200/10 dark:bg-base-200/40">
      <div className="card-body gap-0 p-0">
        <header className="border-base-content/5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {syncing ? (
              <span className="text-primary grid size-6 place-items-center">
                <span className="loading loading-spinner size-6" />
              </span>
            ) : (
              <IconBrandGithub className="text-primary size-6" />
            )}
            <div className="min-w-0">
              <h2 className="text-base leading-6 font-semibold">GitHub</h2>
              <p className="text-base-content/60 truncate text-sm">Issues and pull requests from active repositories</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <button
              className="btn btn-square btn-ghost btn-sm"
              type="button"
              aria-label="Refresh GitHub work items"
              disabled={syncing}
              onClick={refreshWorkItems}>
              <IconRefresh className="size-4" />
            </button>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-xs">
              <input
                aria-label="Only show GitHub work items authored by me"
                checked={githubAuthoredWorkItemsOnly}
                className="toggle toggle-primary toggle-xs"
                type="checkbox"
                onChange={event => void setGithubAuthoredWorkItemsOnly(event.currentTarget.checked)}
              />
              <span className="whitespace-nowrap">Authored by me</span>
            </label>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-xs">
              <input
                aria-label="Show closed GitHub work items"
                checked={githubShowClosedWorkItems}
                className="toggle toggle-primary toggle-xs"
                type="checkbox"
                onChange={event => void setGithubShowClosedWorkItems(event.currentTarget.checked)}
              />
              <span className="whitespace-nowrap">Closed</span>
            </label>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="table-zebra table-sm table w-full table-fixed">
            <colgroup>
              <col className="w-14" />
              <col className="w-20" />
              <col className="w-32" />
              <col className="w-12" />
              <col className="w-full" />
              <col className="w-28" />
              <col className="w-20" />
              <col className="w-24" />
              <col className="w-12" />
            </colgroup>
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className={getGithubWorkItemTableCellClassName(header.column.id)}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className={getGithubTableRowClassName(row.original.id === activeGithubWorkItemId)}>
                  {row.getVisibleCells().map(cell =>
                    cell.column.id === 'identifier' ? (
                      <th key={cell.id} className={getGithubWorkItemTableCellClassName(cell.column.id)} scope="row">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </th>
                    ) : (
                      <td key={cell.id} className={getGithubWorkItemTableCellClassName(cell.column.id)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {syncQuery.isLoading ? (
          <div className="grid min-h-48 place-items-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : null}

        {syncQuery.isError ? (
          <div className="text-error grid min-h-48 place-items-center px-4 text-center text-sm">
            Could not load GitHub work items.
          </div>
        ) : null}

        {syncQuery.isSuccess && workItems.length === 0 ? (
          <div className="text-base-content/60 grid min-h-48 place-items-center px-4 text-center text-sm">
            No GitHub work items found.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function getGithubWorkItemTableMeta(meta: unknown) {
  return meta as GithubWorkItemTableMeta
}

function StartTrackingButton({
  active,
  onStartTracking,
  onStopTracking,
  pending,
  stopping,
  workItem,
}: {
  active: boolean
  onStartTracking: (workItem: SyncedGithubWorkItem) => void
  onStopTracking: (workItem: SyncedGithubWorkItem) => void
  pending: boolean
  stopping: boolean
  workItem: SyncedGithubWorkItem
}) {
  const pressButton = active ? onStopTracking : onStartTracking
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pressButton(workItem)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pressButton(workItem)
  }

  if (active) {
    return (
      <button
        aria-label={`Stop tracking time for ${getGithubWorkItemLabel(workItem)}`}
        className="time-tracking-action-button btn btn-square btn-ghost text-error hover:bg-error/10 size-10 min-h-10"
        data-time-tracking-action={workItem.id}
        title={`Stop tracking time for ${getGithubWorkItemLabel(workItem)}`}
        type="button"
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}>
        {stopping ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <IconPlayerStop className="pointer-events-none size-5" />
        )}
      </button>
    )
  }

  return (
    <button
      aria-label={`Start tracking time for ${getGithubWorkItemLabel(workItem)}`}
      className="time-tracking-action-button btn btn-square btn-ghost text-primary hover:bg-primary/10 size-10 min-h-10"
      data-time-tracking-action={workItem.id}
      title={`Start tracking time for ${getGithubWorkItemLabel(workItem)}`}
      type="button"
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}>
      {pending ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        <IconPlayerPlay className="pointer-events-none size-5" />
      )}
    </button>
  )
}

function AuthorAvatar({ item }: { item: SyncedGithubWorkItem }) {
  const initials = item.author?.slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="avatar tooltip" data-tip={item.author ?? 'Unknown author'}>
      <div className="bg-base-300 text-base-content/70 grid size-7 place-items-center rounded-full text-xs font-semibold">
        {item.authorAvatarUrl ? <img alt={item.author ?? 'GitHub author'} src={item.authorAvatarUrl} /> : initials}
      </div>
    </div>
  )
}

function compareGithubWorkItems(left: SyncedGithubWorkItem, right: SyncedGithubWorkItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
}

function getGithubWorkItemLabel(item: SyncedGithubWorkItem) {
  return `${item.type === 'pullRequest' ? 'PR' : 'Issue'}#${item.number}`
}

function getGithubRepositoryName(repositoryFullName: string) {
  const parts = repositoryFullName.split('/')

  return parts[parts.length - 1] ?? repositoryFullName
}

function getGithubTableRowClassName(active: boolean) {
  return active ? 'tracking-active-row' : undefined
}

function getGithubWorkItemTableCellClassName(columnId: string) {
  switch (columnId) {
    case 'trackingAction':
      return 'w-14 min-w-14 text-center'
    case 'identifier':
      return 'whitespace-nowrap'
    case 'repositoryFullName':
      return 'min-w-0 whitespace-nowrap'
    case 'title':
      return 'w-full min-w-0'
    case 'author':
    case 'lastTrackedAt':
    case 'totalTrackedSeconds':
    case 'totalTrackedAmount':
      return 'whitespace-nowrap'
    case 'externalLink':
      return 'w-12 min-w-12 text-center'
    default:
      return undefined
  }
}

function formatGithubWorkItemDescription({
  issueTemplate,
  issueTemplateFallback,
  item,
  pullRequestTemplate,
  pullRequestTemplateFallback,
}: {
  issueTemplate: string
  issueTemplateFallback: string
  item: SyncedGithubWorkItem
  pullRequestTemplate: string
  pullRequestTemplateFallback: string
}) {
  if (item.type === 'issue') {
    const values = getGithubIssueDescriptionValues(item)

    return formatGithubIssueDescriptionTemplate(issueTemplate, values, { fallback: issueTemplateFallback })
  }

  const values = getGithubPullRequestDescriptionValues(item)

  return formatGithubPullRequestDescriptionTemplate(pullRequestTemplate, values, {
    fallback: pullRequestTemplateFallback,
  })
}

function getGithubIssueDescriptionValues(item: Extract<SyncedGithubWorkItem, { type: 'issue' }>) {
  return {
    author: item.author,
    [internalRefTemplateToken]: getGithubWorkItemInternalRef(item),
    number: item.number,
    owner: item.repositoryOwner,
    repository: item.repositoryFullName,
    state: item.state,
    title: item.title,
    url: item.url,
  } satisfies GithubIssueDescriptionTemplateValues
}

function getGithubPullRequestDescriptionValues(item: Extract<SyncedGithubWorkItem, { type: 'pullRequest' }>) {
  return {
    author: item.author,
    baseBranch: item.baseBranch,
    headBranch: item.headBranch,
    [internalRefTemplateToken]: getGithubWorkItemInternalRef(item),
    number: item.number,
    owner: item.repositoryOwner,
    repository: item.repositoryFullName,
    state: item.state,
    title: item.title,
    url: item.url,
  } satisfies GithubPullRequestDescriptionTemplateValues
}

async function startClockifyTimerForGithubWorkItem({
  billable,
  description,
  item,
  projectId,
  workspaceId,
}: {
  billable: boolean
  description: string
  item: SyncedGithubWorkItem
  projectId: string
  workspaceId: string
}): Promise<TimeEntryDtoImplV1> {
  const body = {
    billable,
    description,
    projectId,
    start: new Date().toISOString(),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest

  githubTimerLog('create time entry request', {
    billable,
    descriptionLength: body.description.length,
    itemId: item.id,
    projectId,
    urlPresent: Boolean(item.url),
    workspaceId,
  })

  return clockify.createTimeEntry(body, { params: { workspaceId } })
}

async function stopClockifyTimerForEntry({
  entry,
  item,
}: {
  entry: TimeEntryDtoImplV1
  item: SyncedGithubWorkItem
}): Promise<TimeEntryDtoImplV1> {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  githubTimerLog('stop time entry request', {
    clockifyEntryId: entry.id,
    itemId: item.id,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  })

  return clockify.stopRunningTimeEntry(
    { end: new Date().toISOString() },
    { params: { userId: entry.userId, workspaceId: entry.workspaceId } },
  )
}

class MissingClockifyDefaultProjectError extends Error {
  constructor() {
    super('Missing default Clockify project.')
  }
}

class MissingRunningClockifyEntryError extends Error {
  constructor() {
    super('Missing running Clockify timer.')
  }
}

function githubTimerLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[github api] timer ${message}`)
    return
  }

  console.info(`[github api] timer ${message}`, details)
}

function summarizeGithubWidgetSyncedEntries(
  entries: Array<{ entry: TimeEntryDtoImplV1; id: string; startedAt: string }>,
) {
  return entries.slice(0, 5).map(entry => ({
    description: truncateGithubWidgetLogText(entry.entry.description),
    end: entry.entry.timeInterval?.end,
    id: entry.id,
    refs: parseInternalRefs(entry.entry.description).map(ref => ref.provider),
    startedAt: entry.startedAt,
  }))
}

function truncateGithubWidgetLogText(value: string | undefined, maxLength = 140) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function githubWidgetLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[github widget] ${message}`)
    return
  }

  console.info(`[github widget] ${message}`, details)
}
