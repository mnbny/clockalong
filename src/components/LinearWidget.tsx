import type { AssignedIssueNode, LinearTicket, LinearTicketStatus } from '../services/linear/tickets'
import type { ColumnDef } from '@tanstack/react-table'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

import { IconExternalLink, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react'
import { eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { useClockifyTimerProject } from '../hooks/useClockifyTimerProject'
import { useDexieQuery } from '../hooks/useDexieQuery'
import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import { clockifyEntryCache } from '../services/clockify/entry-cache'
import { queryClockifySummaries } from '../services/clockify/entry-queries'
import { cacheClockifyEntryResult } from '../services/clockify/sync'
import {
  type ClockifyTicketTimeSummaries,
  getClockifyEntryLinearTicket,
  getLinearTicketInternalRef,
} from '../services/clockify/ticket-summaries'
import { MissingClockifyProjectError } from '../services/clockify/time-entries'
import { selectClockifyWorkspace } from '../services/clockify/workspaces'
import { db } from '../services/db'
import { linearTicketsCollection, useLinearSync } from '../services/linear/sync'
import {
  getLinearTicketSortOrderLabel,
  type LinearTicketSortOrderOption,
  linearTicketSortOrderOptions,
  normalizeLinearTicketSyncLimit,
} from '../services/linear/ticket-settings'
import { isLinearTicketTerminal, sortLinearTickets } from '../services/linear/tickets-sorting'
import { createClockifyTimeEntryForTicket, stopClockifyTimerForEntry } from '../services/linear/timers'
import { useStorage } from '../services/storage/useStorage'
import { getContrastingColor } from '../utils/colors'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { ClockifyEntryTimeDialog } from './ClockifyEntryTimeDialog'
import { LinearIcon } from './icons/LinearIcon'
import { LastTrackedCell, TotalTrackedAmountCell, TotalTrackedCell } from './TrackingSummaryCells'

type TicketTableMeta = {
  activeLinearIssueId: string | undefined
  onAddTime: (ticket: LinearTicket) => void
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
          onAddTime={meta.onAddTime}
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
const emptyClockifySummaries = {}

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
  const [manualTicket, setManualTicket] = useState<LinearTicket | null>(null)
  const [clockifyBillable] = useStorage('clockifyBillable')
  const clockifyTimerProject = useClockifyTimerProject()
  const [clockifyDescriptionTemplate] = useStorage('clockifyDescriptionTemplate')
  const [clockifyDescriptionTemplateFallback] = useStorage('clockifyDescriptionTemplateFallback')
  const [linearTicketSyncLimit] = useStorage('linearTicketSyncLimit')
  const [linearTicketSortOrder, setLinearTicketSortOrder] = useStorage('linearTicketSortOrder')
  const [showAllLinearTickets, setShowAllLinearTickets] = useState(false)
  const linearSync = useLinearSync()
  const {
    lastSyncResult: linearLastSyncResult,
    queries: { syncQuery: linearSyncQuery },
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

    return selectClockifyWorkspace(user, workspaces)
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
  const linearTickets = useMemo(
    () =>
      (syncedLinearTicketsQuery.data?.map(syncedTicket => syncedTicket.ticket) ?? [])
        .slice(0, normalizedLinearTicketSyncLimit)
        .map(toLinearTicket),
    [normalizedLinearTicketSyncLimit, syncedLinearTicketsQuery.data],
  )
  const readTracking = useCallback(() => {
    const userId = clockifyUserQuery.data?.id
    const workspaceId = selectedClockifyWorkspace?.id
    return userId && workspaceId
      ? queryClockifySummaries(
          db,
          { userId, workspaceId },
          linearTickets,
          item => item.id,
          getLinearTicketInternalRef,
          runningEntryQuery.data ?? [],
        )
      : Promise.resolve({})
  }, [clockifyUserQuery.data?.id, selectedClockifyWorkspace?.id, linearTickets, runningEntryQuery.data])
  const trackingQuery = useDexieQuery(readTracking)
  const ticketTimeSummaries = trackingQuery.data ?? emptyClockifySummaries
  const ticketsWithTracking = useMemo(
    () => mergeTicketTimeSummaries(linearTickets, ticketTimeSummaries),
    [linearTickets, ticketTimeSummaries],
  )
  const runningEntryId = runningEntry?.id ?? null
  const activeLinearIssueId = getClockifyEntryLinearTicket(runningEntry, linearTickets)?.id
  const tickets = useMemo(
    () =>
      sortLinearTickets(
        showAllLinearTickets
          ? ticketsWithTracking
          : ticketsWithTracking.filter(ticket => !isLinearTicketTerminal(ticket)),
        {
          activeLinearIssueId,
          sortOrder: linearTicketSortOrder,
        },
      ),
    [activeLinearIssueId, linearTicketSortOrder, showAllLinearTickets, ticketsWithTracking],
  )
  const startTrackingMutation = useMutation({
    mutationFn: async (ticket: LinearTicket) => {
      clockifyTimerLog('start mutation requested', {
        projectSource: clockifyTimerProject ? 'override-or-default' : 'missing',
        ticketIdentifier: ticket.identifier,
      })

      if (!clockifyTimerProject) {
        clockifyTimerLog('start mutation missing project', {
          ticketIdentifier: ticket.identifier,
        })
        throw new MissingClockifyProjectError()
      }

      const entry = await createClockifyTimeEntryForTicket({
        billable: clockifyBillable,
        descriptionTemplate: clockifyDescriptionTemplate,
        descriptionTemplateFallback: clockifyDescriptionTemplateFallback,
        ticket,
        workspaceId: clockifyTimerProject.workspaceId,
        projectId: clockifyTimerProject.projectId,
      })

      return { entry, ticket }
    },
    onError: error => {
      if (error instanceof MissingClockifyProjectError) {
        clockifyTimerLog('start mutation blocked', {
          reason: 'missing-project',
        })
        appToast.warning('Choose a Clockify project first', {
          description: 'Select an override in the Clockify widget or a default project in Settings.',
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
    onMutate: () => clockifyEntryCache.getLifecycle(),
    mutationFn: async (ticket: LinearTicket) => {
      clockifyTimerLog('stop mutation requested', {
        clockifyEntryId: runningEntry?.id,
        ticketIdentifier: ticket.identifier,
      })

      if (!runningEntry) {
        throw new MissingRunningClockifyEntryError()
      }

      const entry = await stopClockifyTimerForEntry({ entry: runningEntry, ticket })

      return { entry, original: runningEntry, ticket }
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
    onSuccess: async ({ entry, original, ticket }, _variables, lifecycle) => {
      clockifyTimerLog('stop mutation succeeded', {
        ticketIdentifier: ticket.identifier,
      })

      try {
        await cacheClockifyEntryResult(entry, original, lifecycle)
      } catch (error) {
        clockifyTimerLog('stop mutation entry persistence failed', {
          error: getErrorMessage(error),
          ticketIdentifier: ticket.identifier,
        })
        appToast.warning('Timer stopped, but the local cache could not be updated.')
      }

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
        onAddTime: setManualTicket,
        onStartTracking: handleStartTracking,
        onStopTracking: handleStopTracking,
        pendingTicketId,
        stoppingTicketId,
      }) satisfies TicketTableMeta,
    [activeLinearIssueId, handleStartTracking, handleStopTracking, pendingTicketId, stoppingTicketId],
  )
  const table = useReactTable({
    columns: ticketColumns,
    data: tickets,
    getCoreRowModel: ticketTableCoreRowModel,
    meta: tableMeta,
  })

  return (
    <section className="card card-border bg-base-200/10 dark:bg-base-200/40">
      <div className="card-body gap-0 p-0">
        <header className="border-base-content/5 flex min-w-0 flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <LinearIcon className="text-primary size-6" />
            <div className="min-w-0">
              <h2 className="text-base leading-6 font-semibold">Linear</h2>
              <p className="text-base-content/60 truncate text-sm">Linear issues assigned to you</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-4">
            <label
              className="flex h-8 cursor-pointer items-center gap-2 text-xs"
              title="Show completed, canceled, duplicate, and unknown-status tickets">
              <input
                aria-label="Show all Linear tickets, including terminal states"
                checked={showAllLinearTickets}
                className="toggle toggle-primary toggle-xs"
                type="checkbox"
                onChange={event => setShowAllLinearTickets(event.currentTarget.checked)}
              />
              <span className="whitespace-nowrap">Show all</span>
            </label>
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

        {linearSyncQuery.isLoading && (
          <div className="grid min-h-48 place-items-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {!!trackingQuery.error && (
          <div role="alert" className="text-error px-4 py-2 text-sm">
            Could not load Clockify totals. {getErrorMessage(trackingQuery.error)}{' '}
            <button className="btn btn-sm" type="button" onClick={trackingQuery.retry}>
              Retry
            </button>
          </div>
        )}

        {linearSyncQuery.isError && (
          <div className="text-error grid min-h-48 place-items-center px-4 text-center text-sm">
            Could not load Linear tickets.
          </div>
        )}

        {linearSyncQuery.isSuccess && linearTickets.length === 0 && (
          <div className="text-base-content/60 grid min-h-48 place-items-center px-4 text-center text-sm">
            No assigned tickets found.
          </div>
        )}
      </div>

      {!!manualTicket && (
        <ClockifyEntryTimeDialog
          description={`${manualTicket.identifier}: ${manualTicket.title}`}
          workspaceId={clockifyTimerProject?.workspaceId}
          onCancel={() => setManualTicket(null)}
          onSave={interval => {
            if (!clockifyTimerProject) throw new MissingClockifyProjectError()
            return createClockifyTimeEntryForTicket({
              billable: clockifyBillable,
              descriptionTemplate: clockifyDescriptionTemplate,
              descriptionTemplateFallback: clockifyDescriptionTemplateFallback,
              interval,
              ticket: manualTicket,
              workspaceId: clockifyTimerProject.workspaceId,
              projectId: clockifyTimerProject.projectId,
            })
          }}
        />
      )}
    </section>
  )
}

function getTicketTableMeta(meta: unknown) {
  return meta as TicketTableMeta
}

function StartTrackingButton({
  active,
  onAddTime,
  onStartTracking,
  onStopTracking,
  pending,
  stopping,
  ticket,
}: {
  active: boolean
  onAddTime: (ticket: LinearTicket) => void
  onStartTracking: (ticket: LinearTicket) => void
  onStopTracking: (ticket: LinearTicket) => void
  pending: boolean
  stopping: boolean
  ticket: LinearTicket
}) {
  const pressButton = active ? onStopTracking : onStartTracking
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.ctrlKey) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    pressButton(ticket)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!active && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault()
      onAddTime(ticket)
      return
    }

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
      title={`Start tracking time for ${ticket.identifier} · Right-click or Shift+F10 to add time`}
      type="button"
      onContextMenu={event => {
        event.preventDefault()
        onAddTime(ticket)
      }}
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
