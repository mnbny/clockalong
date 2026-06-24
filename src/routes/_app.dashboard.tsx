import type { LinearTicket, LinearTicketStatus } from '../services/linear/tickets'
import type { LinearTicketSortOrderOption } from '../services/storage/config'
import type { ColumnDef } from '@tanstack/react-table'
import type { CSSProperties } from 'react'

import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import humanizeDuration from 'humanize-duration'

import { ClockifyWidget } from '../components/ClockifyWidget'
import { LinearIcon } from '../components/icons/LinearIcon'
import { getAssignedLinearTickets } from '../services/linear/tickets'
import { sortLinearTickets } from '../services/linear/ticketSorting'
import { linearTicketSortOrderOptions } from '../services/storage/config'
import { useStorage } from '../services/storage/useStorage'
import { getContrastingColor } from '../utils/colors'

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
    },
  },
  largest: 2,
  round: true,
  spacer: '',
  units: ['h', 'm'],
})

const ticketColumns: Array<ColumnDef<LinearTicket>> = [
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

function DashboardScreen() {
  const [linearTicketFetchLimit] = useStorage('linearTicketFetchLimit')
  const [linearTicketSortBy] = useStorage('linearTicketSortBy')
  const [linearTicketSortOrder, setLinearTicketSortOrder] = useStorage('linearTicketSortOrder')
  const [clockifyLinearEntryLinks] = useStorage('clockifyLinearEntryLinks')
  const ticketsQuery = useQuery({
    queryKey: ['linear', 'assigned-tickets', linearTicketFetchLimit, linearTicketSortBy],
    queryFn: () =>
      getAssignedLinearTickets({
        fetchLimit: linearTicketFetchLimit,
        sortBy: linearTicketSortBy,
      }),
  })
  const tickets = sortLinearTickets(ticketsQuery.data ?? [], {
    clockifyLinearEntryLinks,
    sortOrder: linearTicketSortOrder,
  })

  const table = useReactTable({
    columns: ticketColumns,
    data: tickets,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4">
      <ClockifyWidget />

      <div className="border-base-content/5 bg-base-100 rounded-box overflow-hidden border">
        <header className="border-base-content/5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <LinearIcon className="text-primary size-6" />
            <div className="min-w-0">
              <h2 className="text-base leading-6 font-semibold">Linear</h2>
              <p className="text-base-content/60 truncate text-sm">Linear issues assigned to you</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            {ticketsQuery.isFetching ? <span className="loading loading-spinner loading-xs" /> : null}
            <label className="fieldset w-36 p-0">
              <span className="fieldset-label">Order</span>
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
                    <th key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell =>
                    cell.column.id === 'identifier' ? (
                      <th key={cell.id} scope="row">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </th>
                    ) : (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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

        {ticketsQuery.isSuccess && ticketsQuery.data.length === 0 ? (
          <div className="text-base-content/60 grid min-h-48 place-items-center px-4 text-center text-sm">
            No assigned tickets found.
          </div>
        ) : null}
      </div>
    </section>
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
