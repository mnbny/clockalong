import type { AssignedIssueNode, LinearTicket, LinearTicketStatus } from '../services/linear/tickets'
import type { LinearTicketRefetchIntervalOption, LinearTicketSortOrderOption } from '../services/storage/config'
import type { ColumnDef } from '@tanstack/react-table'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

import { IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import humanizeDuration from 'humanize-duration'
import { useCallback, useEffect, useMemo } from 'react'

import { appToast } from '../components/AppToaster'
import { ClockifyWidget } from '../components/ClockifyWidget'
import { LinearIcon } from '../components/icons/LinearIcon'
import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import { formatClockifyDescriptionTemplate } from '../services/clockify/description-template'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../services/clockify/generated/clockify'
import {
  type ClockifyTicketTimeSummaries,
  getClockifyTicketSummaryStart,
  summarizeClockifyTicketTimeEntries,
} from '../services/clockify/ticket-summaries'
import { linearTicketsPageSize, requestAssignedIssuesPage } from '../services/linear/tickets'
import { sortLinearTickets } from '../services/linear/tickets-sorting'
import { linearTicketSortOrderOptions } from '../services/storage/config'
import { useStorage } from '../services/storage/useStorage'
import { getContrastingColor } from '../utils/colors'
import { getErrorMessage } from '../utils/errors'

export const Route = createFileRoute('/_app/dashboard')({
  component: DashboardScreen,
})

dayjs.extend(relativeTime)

const formatTrackedDuration = humanizeDuration.humanizer({
  delimiter: ' ',
  language: 'shortEn',
  languages: {
    shortEn: {
      h: () => 'h',
      m: () => 'm',
      s: () => 's',
    },
  },
  largest: 3,
  round: true,
  spacer: '',
  units: ['h', 'm', 's'],
})

const clockifyTimeEntriesPageSize = 100

type AssignedIssuesPageParam = {
  after: string | null
  fetchedCount: number
}

type TicketTableMeta = {
  activeLinearIssueId: string | undefined
  onStartTracking: (ticket: LinearTicket) => void
  onStopTracking: (ticket: LinearTicket) => void
  pendingTicketId: string | null | undefined
  stoppingTicketId: string | null | undefined
}

const ticketColumns: Array<ColumnDef<LinearTicket>> = [
  {
    id: 'trackingAction',
    header: () => <span className="sr-only">Time tracking</span>,
    cell: info => {
      const meta = getTicketTableMeta(info.table.options.meta)
      const ticket = info.row.original

      return (
        <StartTrackingButton
          active={meta.activeLinearIssueId === ticket.id}
          pending={meta.pendingTicketId === ticket.id}
          stopping={meta.stoppingTicketId === ticket.id}
          ticket={ticket}
          onStartTracking={meta.onStartTracking}
          onStopTracking={meta.onStopTracking}
        />
      )
    },
  },
  {
    accessorKey: 'identifier',
    header: 'ID',
    cell: info => <span className="font-mono text-sm font-bold">{info.getValue<string>()}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: info => <StatusCell status={info.getValue<LinearTicketStatus>()} />,
  },
  {
    accessorKey: 'title',
    header: 'Ticket',
    cell: info => <span className="block max-w-3xl truncate font-medium">{info.getValue<string>()}</span>,
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
]

function getTicketTableMeta(meta: unknown): TicketTableMeta {
  return meta as TicketTableMeta
}

function DashboardScreen() {
  const queryClient = useQueryClient()
  const [clockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyDescriptionTemplate] = useStorage('clockifyDescriptionTemplate')
  const [clockifyDescriptionTemplateFallback] = useStorage('clockifyDescriptionTemplateFallback')
  const [linearTicketFetchLimit] = useStorage('linearTicketFetchLimit')
  const [linearTicketRefetchInterval] = useStorage('linearTicketRefetchInterval')
  const [linearTicketSortBy] = useStorage('linearTicketSortBy')
  const [linearTicketSortOrder, setLinearTicketSortOrder] = useStorage('linearTicketSortOrder')
  const [clockifyLinearEntryLinks, setClockifyLinearEntryLinks] = useStorage('clockifyLinearEntryLinks')
  const normalizedLinearTicketFetchLimit = normalizeLinearTicketFetchLimit(linearTicketFetchLimit)
  const initialAssignedIssuesPageParam: AssignedIssuesPageParam = { after: null, fetchedCount: 0 }
  const ticketsQuery = useInfiniteQuery({
    queryKey: queryKeys.linear.assignedTickets({
      params: { fetchLimit: normalizedLinearTicketFetchLimit, sortBy: linearTicketSortBy },
    }),
    queryFn: ({ pageParam }) =>
      requestAssignedIssuesPage({
        after: pageParam.after,
        first: Math.min(linearTicketsPageSize, normalizedLinearTicketFetchLimit - pageParam.fetchedCount),
        orderBy: linearTicketSortBy,
      }),
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const page = lastPage.data?.viewer.assignedIssues

      if (!page?.pageInfo.hasNextPage || !page.pageInfo.endCursor || page.nodes.length === 0) {
        return undefined
      }

      const fetchedCount = lastPageParam.fetchedCount + page.nodes.length

      if (fetchedCount >= normalizedLinearTicketFetchLimit) {
        return undefined
      }

      return {
        after: page.pageInfo.endCursor,
        fetchedCount,
      } satisfies AssignedIssuesPageParam
    },
    initialPageParam: initialAssignedIssuesPageParam,
    refetchInterval: getLinearTicketRefetchIntervalMilliseconds(linearTicketRefetchInterval),
  })
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
  const summaryStart = useMemo(
    () => getClockifyTicketSummaryStart(clockifyLinearEntryLinks),
    [clockifyLinearEntryLinks],
  )
  const timeEntriesQuery = useInfiniteQuery({
    enabled: Boolean(clockifyUserQuery.data?.id && selectedClockifyWorkspace?.id && summaryStart),
    queryKey: queryKeys.clockify.timeEntries({
      params: {
        start: summaryStart?.toISOString(),
        userId: clockifyUserQuery.data?.id,
        workspaceId: selectedClockifyWorkspace?.id,
      },
    }),
    queryFn: ({ pageParam }) =>
      clockify.getTimeEntries({
        params: { workspaceId: selectedClockifyWorkspace!.id!, userId: clockifyUserQuery.data!.id! },
        queries: {
          end: new Date().toISOString(),
          hydrated: true,
          page: pageParam,
          'page-size': clockifyTimeEntriesPageSize,
          start: summaryStart!.toISOString(),
        },
      }),
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === clockifyTimeEntriesPageSize ? lastPageParam + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  })
  const {
    fetchNextPage: fetchNextTimeEntriesPage,
    hasNextPage: hasNextTimeEntriesPage,
    isError: timeEntriesError,
    isFetchingNextPage: fetchingNextTimeEntriesPage,
  } = timeEntriesQuery

  useEffect(() => {
    if (!hasNextTimeEntriesPage || fetchingNextTimeEntriesPage || timeEntriesError) {
      return
    }

    void fetchNextTimeEntriesPage()
  }, [fetchNextTimeEntriesPage, fetchingNextTimeEntriesPage, hasNextTimeEntriesPage, timeEntriesError])
  const {
    fetchNextPage: fetchNextTicketsPage,
    hasNextPage: hasNextTicketsPage,
    isError: ticketsError,
    isFetchingNextPage: fetchingNextTicketsPage,
  } = ticketsQuery

  useEffect(() => {
    if (!hasNextTicketsPage || fetchingNextTicketsPage || ticketsError) {
      return
    }

    void fetchNextTicketsPage()
  }, [fetchNextTicketsPage, fetchingNextTicketsPage, hasNextTicketsPage, ticketsError])
  const linearTickets = useMemo(
    () =>
      (ticketsQuery.data?.pages.flatMap(page => page.data?.viewer.assignedIssues.nodes ?? []) ?? [])
        .slice(0, normalizedLinearTicketFetchLimit)
        .map(toLinearTicket),
    [normalizedLinearTicketFetchLimit, ticketsQuery.data],
  )
  const ticketTimeSummaries = useMemo(() => {
    return summarizeClockifyTicketTimeEntries({
      clockifyLinearEntryLinks,
      entries: [...(timeEntriesQuery.data?.pages.flat() ?? []), ...(runningEntryQuery.data ?? [])],
    })
  }, [clockifyLinearEntryLinks, runningEntryQuery.data, timeEntriesQuery.data])
  const ticketsWithTracking = useMemo(
    () => mergeTicketTimeSummaries(linearTickets, ticketTimeSummaries),
    [linearTickets, ticketTimeSummaries],
  )
  const tickets = sortLinearTickets(ticketsWithTracking, {
    clockifyLinearEntryLinks,
    sortOrder: linearTicketSortOrder,
  })
  const runningEntryId = runningEntry?.id ?? null
  const activeLinearIssueId = runningEntryId ? clockifyLinearEntryLinks[runningEntryId]?.linearIssueId : undefined
  const startTrackingMutation = useMutation({
    mutationFn: async (ticket: LinearTicket) => {
      clockifyTimerLog('start mutation requested', {
        defaultProjectPresent: Boolean(clockifyDefaultProject),
        ticketIdentifier: ticket.identifier,
      })

      if (!clockifyDefaultProject) {
        clockifyTimerLog('start mutation missing default project', {
          ticketIdentifier: ticket.identifier,
        })
        throw new MissingClockifyDefaultProjectError()
      }

      const entry = await startClockifyTimerForTicket({
        billable: clockifyBillable,
        descriptionTemplate: clockifyDescriptionTemplate,
        descriptionTemplateFallback: clockifyDescriptionTemplateFallback,
        ticket,
        workspaceId: clockifyDefaultProject.workspaceId,
        projectId: clockifyDefaultProject.projectId,
      })

      if (entry.id) {
        clockifyTimerLog('start mutation saving linear entry link', {
          clockifyEntryId: entry.id,
          ticketIdentifier: ticket.identifier,
        })

        await setClockifyLinearEntryLinks(current => ({
          ...current,
          [entry.id as string]: {
            linearIssueId: ticket.id,
            linkedAt: new Date().toISOString(),
          },
        }))
      } else {
        clockifyTimerLog('start mutation returned entry without id', {
          ticketIdentifier: ticket.identifier,
        })
      }

      return { entry, ticket }
    },
    onError: error => {
      if (error instanceof MissingClockifyDefaultProjectError) {
        clockifyTimerLog('start mutation blocked', {
          reason: 'missing-default-project',
        })
        appToast.warning('Choose a default Clockify project first', {
          description: 'Open settings and select the project to track time against.',
        })
        return
      }

      clockifyTimerLog('start mutation failed', {
        error: getErrorMessage(error),
      })
      appToast.error('Could not start Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: ({ ticket }) => {
      clockifyTimerLog('start mutation succeeded', {
        ticketIdentifier: ticket.identifier,
      })
      appToast.success(`Started timer for ${ticket.identifier}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.timeEntries() })
    },
  })
  const stopTrackingMutation = useMutation({
    mutationFn: async (ticket: LinearTicket) => {
      clockifyTimerLog('stop mutation requested', {
        clockifyEntryId: runningEntry?.id,
        ticketIdentifier: ticket.identifier,
      })

      if (!runningEntry) {
        throw new MissingRunningClockifyEntryError()
      }

      return stopClockifyTimerForEntry({ entry: runningEntry, ticket })
    },
    onError: error => {
      if (error instanceof MissingRunningClockifyEntryError) {
        clockifyTimerLog('stop mutation blocked', {
          reason: 'missing-running-entry',
        })
        appToast.warning('No Clockify timer is running')
        return
      }

      clockifyTimerLog('stop mutation failed', {
        error: getErrorMessage(error),
      })
      appToast.error('Could not stop Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: (_, ticket) => {
      clockifyTimerLog('stop mutation succeeded', {
        ticketIdentifier: ticket.identifier,
      })
      appToast.success(`Stopped timer for ${ticket.identifier}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.timeEntries() })
    },
  })
  const pendingTicketId = startTrackingMutation.isPending ? startTrackingMutation.variables?.id : null
  const stoppingTicketId = stopTrackingMutation.isPending ? stopTrackingMutation.variables?.id : null
  const handleStartTracking = useCallback(
    (ticket: LinearTicket) => {
      clockifyTimerLog('start button pressed', {
        ticketIdentifier: ticket.identifier,
      })
      startTrackingMutation.mutate(ticket)
    },
    [startTrackingMutation],
  )
  const handleStopTracking = useCallback(
    (ticket: LinearTicket) => {
      clockifyTimerLog('stop button pressed', {
        clockifyEntryId: runningEntryId,
        ticketIdentifier: ticket.identifier,
      })
      stopTrackingMutation.mutate(ticket)
    },
    [runningEntryId, stopTrackingMutation],
  )
  const refreshTickets = useCallback(() => {
    void ticketsQuery.refetch()
  }, [ticketsQuery])
  const ticketsRefreshing = ticketsQuery.isFetching

  const table = useReactTable({
    columns: ticketColumns,
    data: tickets,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      activeLinearIssueId,
      onStartTracking: handleStartTracking,
      onStopTracking: handleStopTracking,
      pendingTicketId,
      stoppingTicketId,
    } satisfies TicketTableMeta,
  })

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4">
      <ClockifyWidget />

      <div className="border-base-content/5 bg-base-100 rounded-box overflow-hidden border">
        <header className="border-base-content/5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {ticketsQuery.isFetching ? (
              <span className="text-primary grid size-6 place-items-center">
                <span className="loading loading-spinner size-6" />
              </span>
            ) : (
              <LinearIcon className="text-primary size-6" />
            )}
            <div className="min-w-0">
              <h2 className="text-base leading-6 font-semibold">Linear</h2>
              <p className="text-base-content/60 truncate text-sm">Linear issues assigned to you</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <button
              className="btn btn-square btn-ghost btn-sm"
              type="button"
              aria-label="Refresh Linear tickets"
              disabled={ticketsRefreshing}
              onClick={refreshTickets}>
              <IconRefresh className="size-4" />
            </button>
            <label className="w-36">
              <select
                aria-label="Ticket sort order"
                className="select select-sm select-bordered w-full"
                value={linearTicketSortOrder}
                onChange={event =>
                  void setLinearTicketSortOrder(event.currentTarget.value as LinearTicketSortOrderOption)
                }>
                {linearTicketSortOrderOptions.map(option => (
                  <option key={option} value={option}>
                    {getLinearTicketSortOrderLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="table-zebra table-sm table">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className={getTicketTableCellClassName(header.column.id)}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className={getTicketTableRowClassName(row.original.id === activeLinearIssueId)}>
                  {row.getVisibleCells().map(cell =>
                    cell.column.id === 'identifier' ? (
                      <th key={cell.id} className={getTicketTableCellClassName(cell.column.id)} scope="row">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </th>
                    ) : (
                      <td key={cell.id} className={getTicketTableCellClassName(cell.column.id)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ticketsQuery.isLoading ? (
          <div className="grid min-h-48 place-items-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : null}

        {ticketsQuery.isError ? (
          <div className="text-error grid min-h-48 place-items-center px-4 text-center text-sm">
            Could not load Linear tickets.
          </div>
        ) : null}

        {ticketsQuery.isSuccess && linearTickets.length === 0 ? (
          <div className="text-base-content/60 grid min-h-48 place-items-center px-4 text-center text-sm">
            No assigned tickets found.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function StartTrackingButton({
  active,
  onStartTracking,
  onStopTracking,
  pending,
  stopping,
  ticket,
}: {
  active: boolean
  onStartTracking: (ticket: LinearTicket) => void
  onStopTracking: (ticket: LinearTicket) => void
  pending: boolean
  stopping: boolean
  ticket: LinearTicket
}) {
  const pressButton = active ? onStopTracking : onStartTracking
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pressButton(ticket)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pressButton(ticket)
  }

  if (active) {
    return (
      <button
        aria-label={`Stop tracking time for ${ticket.identifier}`}
        className="time-tracking-action-button btn btn-square btn-ghost text-error hover:bg-error/10 size-10 min-h-10"
        data-time-tracking-action={ticket.identifier}
        title={`Stop tracking time for ${ticket.identifier}`}
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
      aria-label={`Start tracking time for ${ticket.identifier}`}
      className="time-tracking-action-button btn btn-square btn-ghost text-primary hover:bg-primary/10 size-10 min-h-10"
      data-time-tracking-action={ticket.identifier}
      title={`Start tracking time for ${ticket.identifier}`}
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

function StatusCell({ status }: { status: LinearTicketStatus }) {
  const textColor = getContrastingColor(status.color)

  return (
    <span
      className="badge badge-sm whitespace-nowrap"
      style={
        {
          backgroundColor: status.color,
          borderColor: status.color,
          color: textColor,
        } as CSSProperties
      }>
      {status.name}
    </span>
  )
}

function LastTrackedCell({ lastTrackedAt }: { lastTrackedAt: string | null }) {
  if (!lastTrackedAt) {
    return <TrackingPlaceholder />
  }

  return <span className="font-medium whitespace-nowrap">{dayjs(lastTrackedAt).fromNow()}</span>
}

function TotalTrackedCell({ totalTrackedSeconds }: { totalTrackedSeconds: number | null }) {
  if (totalTrackedSeconds === null) {
    return <TrackingPlaceholder />
  }

  return <span className="font-medium whitespace-nowrap">{formatTrackedDuration(totalTrackedSeconds * 1000)}</span>
}

function TrackingPlaceholder() {
  return <span className="text-base-content/40 font-medium">Not tracked</span>
}

function mergeTicketTimeSummaries(
  tickets: LinearTicket[],
  ticketTimeSummaries: ClockifyTicketTimeSummaries,
): LinearTicket[] {
  return tickets.map(ticket => {
    const summary = ticketTimeSummaries[ticket.id]

    if (!summary) {
      return ticket
    }

    return {
      ...ticket,
      lastTrackedAt: summary.lastTrackedAt,
      totalTrackedSeconds: summary.totalTrackedSeconds,
    }
  })
}

function toLinearTicket(issue: AssignedIssueNode): LinearTicket {
  return {
    assignee: issue.assignee,
    createdAt: issue.createdAt,
    id: issue.id,
    identifier: issue.identifier,
    lastTrackedAt: null,
    status: issue.state,
    title: issue.title,
    totalTrackedSeconds: null,
    updatedAt: issue.updatedAt,
  }
}

function normalizeLinearTicketFetchLimit(fetchLimit: number) {
  if (!Number.isFinite(fetchLimit)) {
    return linearTicketsPageSize
  }

  return Math.max(1, Math.floor(fetchLimit))
}

function getTicketTableCellClassName(columnId: string) {
  return columnId === 'trackingAction' ? 'w-14 min-w-14 text-center' : undefined
}

function getTicketTableRowClassName(active: boolean) {
  return active ? 'tracking-active-row' : undefined
}

async function startClockifyTimerForTicket({
  billable,
  descriptionTemplate,
  descriptionTemplateFallback,
  projectId,
  ticket,
  workspaceId,
}: {
  billable: boolean
  descriptionTemplate: string
  descriptionTemplateFallback: string
  projectId: string
  ticket: LinearTicket
  workspaceId: string
}): Promise<TimeEntryDtoImplV1> {
  const body = {
    billable,
    description: formatClockifyDescriptionTemplate(
      descriptionTemplate,
      {
        assigneeName: ticket.assignee?.displayName ?? ticket.assignee?.name,
        identifier: ticket.identifier,
        number: getLinearTicketNumber(ticket.identifier),
        stateName: ticket.status.name,
        teamKey: getLinearTicketTeamKey(ticket.identifier),
        title: ticket.title,
      },
      { fallback: descriptionTemplateFallback },
    ),
    projectId,
    start: new Date().toISOString(),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest

  clockifyTimerLog('create time entry request', {
    billable,
    descriptionLength: body.description.length,
    projectId,
    ticketIdentifier: ticket.identifier,
    workspaceId,
  })

  return clockify.createTimeEntry(body, { params: { workspaceId } })
}

async function stopClockifyTimerForEntry({
  entry,
  ticket,
}: {
  entry: TimeEntryDtoImplV1
  ticket: LinearTicket
}): Promise<TimeEntryDtoImplV1> {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  clockifyTimerLog('stop time entry request', {
    clockifyEntryId: entry.id,
    ticketIdentifier: ticket.identifier,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  })

  return clockify.stopRunningTimeEntry(
    { end: new Date().toISOString() },
    { params: { userId: entry.userId, workspaceId: entry.workspaceId } },
  )
}

function getLinearTicketNumber(identifier: string) {
  const identifierParts = identifier.split('-')
  const number = Number(identifierParts[identifierParts.length - 1])
  return Number.isFinite(number) ? number : undefined
}

function getLinearTicketTeamKey(identifier: string) {
  const [teamKey] = identifier.split('-')
  return teamKey || undefined
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

function clockifyTimerLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify api] timer ${message}`)
    return
  }

  console.info(`[clockify api] timer ${message}`, details)
}

function getLinearTicketSortOrderLabel(option: LinearTicketSortOrderOption) {
  switch (option) {
    case 'alphabetical':
      return 'Alphabetical'
    case 'created':
      return 'Created'
    case 'custom':
      return 'Clinear'
    case 'status':
      return 'Status'
    case 'updated':
      return 'Updated'
  }
}

function getLinearTicketRefetchIntervalMilliseconds(option: LinearTicketRefetchIntervalOption) {
  switch (option) {
    case 'manual':
      return false
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '30m':
      return 30 * 60_000
    case '1h':
      return 60 * 60_000
  }
}
