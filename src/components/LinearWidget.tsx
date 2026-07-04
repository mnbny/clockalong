import type { AssignedIssueNode, LinearTicket, LinearTicketStatus } from '../services/linear/tickets'
import type { ColumnDef } from '@tanstack/react-table'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

import { IconExternalLink, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import { and, eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useCallback, useEffect, useMemo } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import {
  type ClockifyDescriptionTemplateValues,
  formatClockifyDescriptionTemplate,
} from '../services/clockify/description-template'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../services/clockify/generated/clockify'
import { clockifyTimeEntriesCollection } from '../services/clockify/sync'
import {
  type ClockifyTicketTimeSummaries,
  getClockifyEntryLinearTicket,
  getLinearTicketInternalRef,
  summarizeClockifyTicketTimeEntries,
} from '../services/clockify/ticket-summaries'
import { linearTicketsCollection, useLinearSync } from '../services/linear/sync'
import {
  getLinearTicketSortOrderLabel,
  type LinearTicketSortOrderOption,
  linearTicketSortOrderOptions,
  normalizeLinearTicketSyncLimit,
} from '../services/linear/ticket-settings'
import { sortLinearTickets } from '../services/linear/tickets-sorting'
import { useStorage } from '../services/storage/useStorage'
import { getContrastingColor } from '../utils/colors'
import { getErrorMessage } from '../utils/errors'
import { internalRefTemplateToken, parseInternalRefs, parseTemplateTokens } from '../utils/templates'
import { appToast } from './AppToaster'
import { LinearIcon } from './icons/LinearIcon'
import { LastTrackedCell, TotalTrackedAmountCell, TotalTrackedCell } from './TrackingSummaryCells'

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
      const ticket = info.row.original
      return (
        <TotalTrackedAmountCell
          totalTrackedAmount={info.getValue<number | null>()}
          totalTrackedAmountCurrency={ticket.totalTrackedAmountCurrency}
        />
      )
    },
  },
  {
    id: 'externalLink',
    header: () => <span className="sr-only">Open</span>,
    cell: info => {
      const ticket = info.row.original

      return (
        <a
          className="btn btn-square btn-ghost text-primary hover:bg-primary/10 btn-sm"
          href={ticket.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Open ${ticket.identifier} in Linear`}>
          <IconExternalLink className="size-4" />
        </a>
      )
    },
  },
]

const ticketTableCoreRowModel = getCoreRowModel<LinearTicket>()

export function LinearWidget() {
  const authState = useAppAuth()
  const linearAuthenticated = authState.value.linearAuthenticated && !authState.loading

  if (!linearAuthenticated) {
    return null
  }

  return <LinearWidgetContent />
}

function LinearWidgetContent() {
  const queryClient = useQueryClient()
  const [clockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyDescriptionTemplate] = useStorage('clockifyDescriptionTemplate')
  const [clockifyDescriptionTemplateFallback] = useStorage('clockifyDescriptionTemplateFallback')
  const [linearTicketSyncLimit] = useStorage('linearTicketSyncLimit')
  const [linearTicketSortOrder, setLinearTicketSortOrder] = useStorage('linearTicketSortOrder')
  const linearSync = useLinearSync()
  const {
    lastSyncResult: linearLastSyncResult,
    queries: { syncQuery: linearSyncQuery },
    syncing: linearSyncing,
    syncNow: syncLinearTickets,
  } = linearSync
  const normalizedLinearTicketSyncLimit = normalizeLinearTicketSyncLimit(linearTicketSyncLimit)
  const linearViewerId = linearLastSyncResult?.viewerId
  const syncedLinearTicketsQuery = useLiveQuery(
    q => {
      if (!linearViewerId) {
        return null
      }

      return q
        .from({ syncedTicket: linearTicketsCollection })
        .where(({ syncedTicket }) => eq(syncedTicket.viewerId, linearViewerId))
        .orderBy(({ syncedTicket }) => syncedTicket.updatedAt)
    },
    [linearViewerId],
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
  const linearTickets = useMemo(
    () =>
      (syncedLinearTicketsQuery.data?.map(syncedTicket => syncedTicket.ticket) ?? [])
        .slice(0, normalizedLinearTicketSyncLimit)
        .map(toLinearTicket),
    [normalizedLinearTicketSyncLimit, syncedLinearTicketsQuery.data],
  )
  const ticketTimeSummaries = useMemo(() => {
    return summarizeClockifyTicketTimeEntries({
      entries: [
        ...(syncedTimeEntriesQuery.data?.map(syncedEntry => syncedEntry.entry) ?? []),
        ...(runningEntryQuery.data ?? []),
      ],
      tickets: linearTickets,
    })
  }, [linearTickets, runningEntryQuery.data, syncedTimeEntriesQuery.data])
  useEffect(() => {
    linearWidgetLog('clockify summary inputs', {
      linearTicketCount: linearTickets.length,
      runningEntryCount: runningEntryQuery.data?.length ?? 0,
      sampleSyncedEntries: summarizeLinearWidgetSyncedEntries(syncedTimeEntriesQuery.data ?? []),
      summaryCount: Object.keys(ticketTimeSummaries).length,
      syncedEntryCount: syncedTimeEntriesQuery.data?.length ?? 0,
      userId: clockifyUserQuery.data?.id,
      workspaceId: selectedClockifyWorkspace?.id,
    })
  }, [
    clockifyUserQuery.data?.id,
    linearTickets.length,
    runningEntryQuery.data,
    selectedClockifyWorkspace?.id,
    syncedTimeEntriesQuery.data,
    ticketTimeSummaries,
  ])
  const ticketsWithTracking = useMemo(
    () => mergeTicketTimeSummaries(linearTickets, ticketTimeSummaries),
    [linearTickets, ticketTimeSummaries],
  )
  const runningEntryId = runningEntry?.id ?? null
  const activeLinearIssueId = getClockifyEntryLinearTicket(runningEntry, linearTickets)?.id
  const tickets = useMemo(
    () =>
      sortLinearTickets(ticketsWithTracking, {
        activeLinearIssueId,
        sortOrder: linearTicketSortOrder,
      }),
    [activeLinearIssueId, linearTicketSortOrder, ticketsWithTracking],
  )
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
    onSuccess: ({ entry, ticket }) => {
      if (!entry.id) {
        clockifyTimerLog('start mutation returned entry without id', {
          ticketIdentifier: ticket.identifier,
        })
      }

      clockifyTimerLog('start mutation succeeded', {
        ticketIdentifier: ticket.identifier,
      })
      appToast.success(`Started timer for ${ticket.identifier}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
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
  const tableMeta = useMemo(
    () =>
      ({
        activeLinearIssueId,
        onStartTracking: handleStartTracking,
        onStopTracking: handleStopTracking,
        pendingTicketId,
        stoppingTicketId,
      }) satisfies TicketTableMeta,
    [activeLinearIssueId, handleStartTracking, handleStopTracking, pendingTicketId, stoppingTicketId],
  )
  const refreshTickets = useCallback(() => {
    void Promise.all([
      syncLinearTickets(),
      queryClient.refetchQueries({ queryKey: queryKeys.clockify.runningEntry() }),
      queryClient.refetchQueries({ queryKey: queryKeys.clockify.entrySync() }),
    ])
  }, [queryClient, syncLinearTickets])
  const ticketsRefreshing = linearSyncing
  const table = useReactTable({
    columns: ticketColumns,
    data: tickets,
    getCoreRowModel: ticketTableCoreRowModel,
    meta: tableMeta,
  })

  return (
    <section className="card card-border bg-base-200/10 dark:bg-base-200/40">
      <div className="card-body gap-0 p-0">
        <header className="border-base-content/5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {linearSyncing ? (
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
          <table className="table-zebra table-sm table w-full table-fixed">
            <colgroup>
              <col className="w-14" />
              <col className="w-24" />
              <col className="w-32" />
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

        {linearSyncQuery.isLoading ? (
          <div className="grid min-h-48 place-items-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : null}

        {linearSyncQuery.isError ? (
          <div className="text-error grid min-h-48 place-items-center px-4 text-center text-sm">
            Could not load Linear tickets.
          </div>
        ) : null}

        {linearSyncQuery.isSuccess && linearTickets.length === 0 ? (
          <div className="text-base-content/60 grid min-h-48 place-items-center px-4 text-center text-sm">
            No assigned tickets found.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function getTicketTableMeta(meta: unknown) {
  return meta as TicketTableMeta
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
      totalTrackedAmount: summary.totalTrackedAmount,
      totalTrackedAmountCurrency: summary.totalTrackedAmountCurrency,
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
    totalTrackedAmount: null,
    totalTrackedAmountCurrency: null,
    totalTrackedSeconds: null,
    updatedAt: issue.updatedAt,
    url: issue.url,
  }
}

function getTicketTableCellClassName(columnId: string) {
  switch (columnId) {
    case 'trackingAction':
      return 'w-14 min-w-14 text-center'
    case 'identifier':
    case 'status':
    case 'lastTrackedAt':
    case 'totalTrackedSeconds':
    case 'totalTrackedAmount':
      return 'whitespace-nowrap'
    case 'externalLink':
      return 'w-12 min-w-12 text-center'
    case 'title':
      return 'w-full min-w-0'
    default:
      return undefined
  }
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
  const descriptionValues = {
    assigneeName: ticket.assignee?.displayName ?? ticket.assignee?.name,
    identifier: ticket.identifier,
    [internalRefTemplateToken]: getLinearTicketInternalRef(ticket),
    number: getLinearTicketNumber(ticket.identifier),
    stateName: ticket.status.name,
    teamKey: getLinearTicketTeamKey(ticket.identifier),
    title: ticket.title,
    url: ticket.url,
  } satisfies ClockifyDescriptionTemplateValues
  const body = {
    billable,
    description: formatClockifyDescriptionTemplate(descriptionTemplate, descriptionValues, {
      fallback: descriptionTemplateFallback,
    }),
    projectId,
    start: new Date().toISOString(),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest
  const templateTokens = parseTemplateTokens(descriptionTemplate)
  const missingTemplateTokens = templateTokens.filter(token => {
    const value = descriptionValues[token as keyof typeof descriptionValues]
    return value === null || value === undefined || (typeof value === 'string' && !value.trim())
  })

  clockifyTimerLog('create time entry request', {
    billable,
    descriptionLength: body.description.length,
    missingTemplateTokens,
    projectId,
    ticketIdentifier: ticket.identifier,
    templateTokens,
    urlPresent: Boolean(descriptionValues.url),
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

function summarizeLinearWidgetSyncedEntries(
  entries: Array<{ entry: TimeEntryDtoImplV1; id: string; startedAt: string }>,
) {
  return entries.slice(0, 5).map(entry => ({
    description: truncateLinearWidgetLogText(entry.entry.description),
    end: entry.entry.timeInterval?.end,
    id: entry.id,
    refs: parseInternalRefs(entry.entry.description).map(ref => ref.provider),
    startedAt: entry.startedAt,
  }))
}

function truncateLinearWidgetLogText(value: string | undefined, maxLength = 140) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function linearWidgetLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[linear widget] ${message}`)
    return
  }

  console.info(`[linear widget] ${message}`, details)
}
