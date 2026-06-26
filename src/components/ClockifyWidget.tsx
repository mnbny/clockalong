import type { TimeEntryWithRatesDtoV1 } from '../services/clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'

import { formatCurrency } from '@automattic/format-currency'
import { IconCalendarDue, IconCalendarMonth, IconCalendarWeek, IconClockPlay, IconRefresh } from '@tabler/icons-react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import humanizeDuration from 'humanize-duration'
import { useMemo } from 'react'
import { useStopwatch } from 'react-timer-hook'

import { queryKeys } from '../lib/query-client'
import { clockify, clockifyReports } from '../services/clockify/client'
import { ClockifyIcon } from './icons/ClockifyIcon'

type ClockifyPeriodStat = {
  amount: string
  label: string
  time: string
}

const clockifyReportPeriods = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
] as const

function ClockifyRefreshButton({ fetching }: { fetching: boolean }) {
  const queryClient = useQueryClient()

  return (
    <button
      className="btn btn-square btn-ghost btn-sm"
      type="button"
      aria-label="Refresh Clockify"
      disabled={fetching}
      onClick={() =>
        void Promise.all([
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.loggedUser }),
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.workspaces }),
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.runningTimeEntries() }),
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.summaryReport() }),
        ])
      }>
      <IconRefresh className="size-4" />
    </button>
  )
}

const formatShortDuration = humanizeDuration.humanizer({
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

export function ClockifyWidget() {
  const userQuery = useQuery({
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    staleTime: 5 * 60_000,
  })
  const workspacesQuery = useQuery({
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    staleTime: 5 * 60_000,
  })
  const selectedWorkspace = useMemo(() => {
    const user = userQuery.data
    const workspaces = workspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
  }, [userQuery.data, workspacesQuery.data])
  const runningEntriesQuery = useQuery({
    enabled: Boolean(userQuery.data?.id && selectedWorkspace?.id),
    queryKey: queryKeys.clockify.runningTimeEntries({
      params: { userId: userQuery.data?.id, workspaceId: selectedWorkspace?.id },
    }),
    queryFn: () =>
      clockify.getTimeEntries({
        params: { workspaceId: selectedWorkspace!.id!, userId: userQuery.data!.id! },
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
  const reportQueries = useQueries({
    queries: clockifyReportPeriods.map(period => ({
      enabled: Boolean(userQuery.data?.id && selectedWorkspace?.id),
      queryKey: queryKeys.clockify.summaryReport({
        params: { period: period.id, userId: userQuery.data?.id, workspaceId: selectedWorkspace?.id },
      }),
      queryFn: () => {
        const now = new Date()

        return clockifyReports.generateSummaryReport(
          {
            amountShown: 'EARNED',
            amounts: ['EARNED'],
            dateRangeEnd: toClockifyReportDate(now),
            dateRangeStart: toClockifyReportDate(getReportPeriodStart(period.id, now)),
            dateRangeType: 'ABSOLUTE',
            exportType: 'JSON',
            rounding: false,
            summaryFilter: {
              groups: ['USER'],
              sortColumn: 'GROUP',
              summaryChartType: 'BILLABILITY',
            },
            users: {
              contains: 'CONTAINS',
              ids: [userQuery.data!.id!],
              status: 'ACTIVE',
            },
          },
          { params: { workspaceId: selectedWorkspace!.id! } },
        )
      },
      refetchInterval: 15 * 60_000,
      staleTime: 60_000,
    })),
  })
  const runningEntry = useMemo(() => {
    const runningEntries = runningEntriesQuery.data ?? []
    return runningEntries.find(entry => entry.userId === userQuery.data?.id) ?? runningEntries[0] ?? null
  }, [runningEntriesQuery.data, userQuery.data?.id])
  const todayReport = reportQueries[0]?.data
  const weekReport = reportQueries[1]?.data
  const monthReport = reportQueries[2]?.data
  const periodStats = useMemo(
    () =>
      clockifyReportPeriods.map((period, index) =>
        formatReportPeriodStat(period.label, [todayReport, weekReport, monthReport][index]),
      ),
    [monthReport, todayReport, weekReport],
  )
  const fetching =
    userQuery.isFetching ||
    workspacesQuery.isFetching ||
    runningEntriesQuery.isFetching ||
    reportQueries.some(query => query.isFetching)

  return (
    <section className="border-base-content/5 bg-base-100 rounded-box overflow-hidden border">
      <header className="border-base-content/5 flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {fetching ? (
            <span className="text-primary grid size-6 place-items-center">
              <span className="loading loading-spinner size-6" />
            </span>
          ) : (
            <ClockifyIcon className="text-primary size-6" />
          )}
          <div className="min-w-0">
            <h2 className="text-base leading-6 font-semibold">Clockify</h2>
            <p className="text-base-content/60 truncate text-sm">Time tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ClockifyRefreshButton fetching={fetching} />
          <ClockifyStatusBadge running={Boolean(runningEntry)} />
        </div>
      </header>

      <div className="divide-base-content/5 grid divide-y lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:divide-x lg:divide-y-0">
        <div className="grid min-h-44 content-center gap-2 px-4 py-3">
          {runningEntry ? (
            <RunningTimerView
              key={runningEntry.id ?? runningEntry.timeInterval?.start ?? 'running-entry'}
              entry={runningEntry}
            />
          ) : (
            <>
              <div className="text-base-content/60 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <IconClockPlay className="size-4" />
                Timer
              </div>
              <div className="text-3xl leading-none font-semibold tabular-nums">0s</div>
              <div className="text-base-content/60 text-sm">No timer running</div>
            </>
          )}
        </div>

        <div className="divide-base-content/5 grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {periodStats.map(stat => (
            <div key={stat.label} className="grid min-h-44 content-center gap-2 px-4 py-3">
              <div className="text-base-content/60 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <PeriodStatIcon label={stat.label} />
                {stat.label}
              </div>
              <div className="text-xl leading-7 font-semibold tabular-nums">{stat.time}</div>
              <div className="text-base-content/60 text-sm tabular-nums">{stat.amount}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClockifyStatusBadge({ running }: { running: boolean }) {
  if (running) {
    return <span className="badge badge-success animate-pulse">Running</span>
  }

  return <span className="badge badge-error">Not Running</span>
}

function PeriodStatIcon({ label }: { label: string }) {
  switch (label) {
    case 'Today':
      return <IconCalendarDue className="size-4" />
    case 'Week':
      return <IconCalendarWeek className="size-4" />
    case 'Month':
      return <IconCalendarMonth className="size-4" />
    default:
      return null
  }
}

function RunningTimerView({ entry }: { entry: TimeEntryWithRatesDtoV1 }) {
  return (
    <>
      <div className="text-base-content/60 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        <IconClockPlay className="size-4" />
        Timer
      </div>
      <RunningTimerElapsed start={entry.timeInterval?.start} />
      <div className="text-base-content/60 truncate text-sm">{getEntryTitle(entry)}</div>
    </>
  )
}

function RunningTimerElapsed({ start }: { start: string | undefined }) {
  const stopwatchOffset = useMemo(() => getStopwatchOffsetTimestamp(start), [start])
  const { totalSeconds } = useStopwatch({
    autoStart: Boolean(stopwatchOffset),
    interval: 1000,
    offsetTimestamp: stopwatchOffset ?? undefined,
  })

  return (
    <div className="text-3xl leading-none font-semibold tabular-nums">{formatShortDuration(totalSeconds * 1000)}</div>
  )
}

function getStopwatchOffsetTimestamp(startValue: string | undefined) {
  const start = parseDate(startValue)

  if (!start) {
    return null
  }

  const elapsedMilliseconds = Math.max(0, Date.now() - start.getTime())
  return new Date(Date.now() + elapsedMilliseconds)
}

function formatReportPeriodStat(label: string, report: TimeEntrySummaryReportDto | undefined): ClockifyPeriodStat {
  const totals = report?.totals ?? []
  const seconds = totals.reduce((total, entryTotal) => total + (entryTotal.totalTime ?? 0), 0)
  const amount = totals.reduce((total, entryTotal) => {
    const earned = entryTotal.amounts?.find(entryAmount => entryAmount.type === 'EARNED')
    return total + (earned?.value ?? 0) / 100
  }, 0)

  return {
    amount: formatCurrency(amount, 'USD'),
    label,
    time: formatShortDuration(seconds * 1000),
  }
}

function getEntryTitle(entry: TimeEntryWithRatesDtoV1) {
  return entry.description?.trim() || 'Untitled time entry'
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toClockifyReportDate(date: Date) {
  return date.toISOString().replace(/Z$/, '')
}

function getReportPeriodStart(period: (typeof clockifyReportPeriods)[number]['id'], now: Date) {
  switch (period) {
    case 'today':
      return getDayStart(now)
    case 'week':
      return getWeekStart(now)
    case 'month':
      return getMonthStart(now)
  }
}

function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getWeekStart(date: Date) {
  const dayStart = getDayStart(date)
  const day = dayStart.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  dayStart.setDate(dayStart.getDate() + mondayOffset)
  return dayStart
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
