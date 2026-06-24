import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'

import { formatCurrency } from '@automattic/format-currency'
import { IconCalendarDue, IconCalendarMonth, IconCalendarWeek, IconClockHour4 } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import humanizeDuration from 'humanize-duration'
import { useMemo } from 'react'
import { useStopwatch } from 'react-timer-hook'

import { clockify, clockifyReports, type TimeEntryWithRatesDtoV1 } from '../services/clockify'
import { ClockifyIcon } from './icons/ClockifyIcon'

type ClockifyPeriodStat = {
  amount: string
  label: string
  time: string
}

type ClockifyRunningTimer = {
  elapsed: string
  title: string
}

type ClockifyWidgetData = {
  periodStats: ClockifyPeriodStat[]
  runningEntry: TimeEntryWithRatesDtoV1 | null
}

const formatShortDuration = humanizeDuration.humanizer({
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

export function ClockifyWidget() {
  const widgetQuery = useQuery({
    queryKey: ['clockify', 'dashboard-widget'],
    queryFn: getClockifyWidgetData,
    refetchInterval: 15 * 60_000,
    staleTime: 60_000,
  })
  const runningEntry = widgetQuery.data?.runningEntry ?? null
  const periodStats = widgetQuery.data?.periodStats ?? getEmptyPeriodStats()

  const statusLabel = widgetQuery.isLoading ? 'Loading' : widgetQuery.isError ? 'Unavailable' : 'Ready'

  return (
    <section className="border-base-content/5 bg-base-100 rounded-box overflow-hidden border">
      <header className="border-base-content/5 flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ClockifyIcon className="text-primary size-6" />
          <div className="min-w-0">
            <h2 className="text-base leading-6 font-semibold">Clockify</h2>
            <p className="text-base-content/60 truncate text-sm">Time tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {widgetQuery.isFetching ? <span className="loading loading-spinner loading-xs" /> : null}
          <span className="badge badge-soft badge-sm">{statusLabel}</span>
        </div>
      </header>

      <div className="divide-base-content/5 grid divide-y lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:divide-x lg:divide-y-0">
        <div className="grid min-h-44 content-between gap-4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <IconClockHour4 className="text-base-content/60 size-4" />
            Running timer
          </div>

          {runningEntry ? (
            <RunningTimerView
              key={runningEntry.id ?? runningEntry.timeInterval?.start ?? 'running-entry'}
              entry={runningEntry}
            />
          ) : (
            <div className="grid gap-2">
              <div className="text-base-content/45 text-3xl leading-none font-semibold tabular-nums">0h 00m</div>
              <div className="text-base-content/60 text-sm">No timer running</div>
            </div>
          )}
        </div>

        <div className="divide-base-content/5 grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {periodStats.map(stat => (
            <div key={stat.label} className="grid min-h-44 content-center gap-1 px-4 py-3">
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
  const stopwatchOffset = useMemo(
    () => getStopwatchOffsetTimestamp(entry.timeInterval?.start),
    [entry.timeInterval?.start],
  )
  const { totalSeconds } = useStopwatch({
    autoStart: Boolean(stopwatchOffset),
    interval: 1000,
    offsetTimestamp: stopwatchOffset ?? undefined,
  })
  const runningTimer = formatRunningTimer(entry, totalSeconds)

  return (
    <div className="grid gap-3">
      <div className="text-3xl leading-none font-semibold tabular-nums">{runningTimer?.elapsed ?? '0m'}</div>
      <div className="grid min-w-0 gap-1">
        <div className="truncate font-medium">{runningTimer?.title ?? getEntryTitle(entry)}</div>
        <div className="text-base-content/60 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-sm">
          <span>Clockify timer is active</span>
        </div>
      </div>
    </div>
  )
}

async function getClockifyWidgetData(): Promise<ClockifyWidgetData> {
  const [user, workspaces] = await Promise.all([clockify.getLoggedUser(), clockify.getWorkspacesOfUser()])
  const workspaceId = user.activeWorkspace ?? user.defaultWorkspace ?? workspaces[0]?.id

  if (!user.id || !workspaceId) {
    return { periodStats: getEmptyPeriodStats(), runningEntry: null }
  }

  const now = new Date()

  const [runningEntries, periodStats] = await Promise.all([
    clockify.getTimeEntries({
      params: { workspaceId, userId: user.id },
      queries: {
        hydrated: true,
        'in-progress': 'true',
        page: 1,
        'page-size': 1,
      },
    }),
    getReportPeriodStats({ now, userId: user.id, workspaceId }),
  ])

  const runningEntry = runningEntries.find(entry => entry.userId === user.id) ?? runningEntries[0] ?? null
  return { periodStats, runningEntry }
}

function formatRunningTimer(
  entry: TimeEntryWithRatesDtoV1 | null,
  elapsedSeconds: number,
): ClockifyRunningTimer | null {
  if (!entry) {
    return null
  }

  return {
    elapsed: formatShortDuration(elapsedSeconds * 1000),
    title: getEntryTitle(entry),
  }
}

function getStopwatchOffsetTimestamp(startValue: string | undefined) {
  const start = parseDate(startValue)

  if (!start) {
    return null
  }

  const elapsedMilliseconds = Math.max(0, Date.now() - start.getTime())
  return new Date(Date.now() + elapsedMilliseconds)
}

async function getReportPeriodStats({
  now,
  userId,
  workspaceId,
}: {
  now: Date
  userId: string
  workspaceId: string
}): Promise<ClockifyPeriodStat[]> {
  const periods = [
    { label: 'Today', start: getDayStart(now) },
    { label: 'Week', start: getWeekStart(now) },
    { label: 'Month', start: getMonthStart(now) },
  ]

  const reports = await Promise.all(
    periods.map(period =>
      clockifyReports.generateSummaryReport(
        {
          amountShown: 'EARNED',
          amounts: ['EARNED'],
          dateRangeEnd: toClockifyReportDate(now),
          dateRangeStart: toClockifyReportDate(period.start),
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
            ids: [userId],
            status: 'ACTIVE',
          },
        },
        { params: { workspaceId } },
      ),
    ),
  )

  return periods.map((period, index) => formatReportPeriodStat(period.label, reports[index]))
}

function getEmptyPeriodStats(): ClockifyPeriodStat[] {
  return ['Today', 'Week', 'Month'].map(label => ({
    amount: formatCurrency(0, 'USD'),
    label,
    time: '0m',
  }))
}

function formatReportPeriodStat(label: string, report: TimeEntrySummaryReportDto): ClockifyPeriodStat {
  const totals = report.totals ?? []
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
