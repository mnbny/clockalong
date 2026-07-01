import type { TimeEntryWithRatesDtoV1, UpdateTimeEntryRequest } from '../services/clockify/generated/clockify'
import type { TimeEntrySummaryReportDto } from '../services/clockify/generated/reports'

import { formatCurrency } from '@automattic/format-currency'
import {
  IconCalendarDue,
  IconCalendarMonth,
  IconCalendarWeek,
  IconClockPlay,
  IconEye,
  IconEyeOff,
  IconPlayerStop,
  IconRefresh,
  IconWand,
} from '@tabler/icons-react'
import { and, eq, gte, lt, useLiveQuery } from '@tanstack/react-db'
import { useIsFetching, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import humanizeDuration from 'humanize-duration'
import { useMemo, useRef, useState } from 'react'
import { useStopwatch } from 'react-timer-hook'

import { queryKeys } from '../lib/query-client'
import { clockify, clockifyReports } from '../services/clockify/client'
import { clockifyTimeEntriesCollection, type SyncedClockifyTimeEntry } from '../services/clockify/sync'
import {
  type ClockifyTimeEntryOverlapFix,
  getCompletedClockifyTimeEntryOverlapFixes,
} from '../services/clockify/overlaps'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { ClockifyIcon } from './icons/ClockifyIcon'

type ClockifyPeriodStat = {
  amount: string
  id: ClockifyReportPeriodId
  label: string
  time: string
}

const clockifyReportPeriods = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
] as const
type ClockifyReportPeriodId = (typeof clockifyReportPeriods)[number]['id']
type ClockifyOverlapDialogState = {
  fixes: ClockifyTimeEntryOverlapFix[]
  label: string
}

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
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.runningEntry() }),
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.summaryReport() }),
          queryClient.refetchQueries({ queryKey: queryKeys.clockify.entrySync() }),
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
  const queryClient = useQueryClient()
  const fixOverlapDialogRef = useRef<HTMLDialogElement>(null)
  const [entriesVisible, setEntriesVisible] = useState(false)
  const [overlapDialogState, setOverlapDialogState] = useState<ClockifyOverlapDialogState | null>(null)
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
  const runningEntryQuery = useQuery({
    enabled: Boolean(userQuery.data?.id && selectedWorkspace?.id),
    queryKey: queryKeys.clockify.runningEntry({
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
        const range = getClockifyReportPeriodRange(period.id, now)

        return clockifyReports.generateSummaryReport(
          {
            amountShown: 'EARNED',
            amounts: ['EARNED'],
            dateRangeEnd: toClockifyReportDate(range.end),
            dateRangeStart: toClockifyReportDate(range.start),
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
  const entrySyncFetching = useIsFetching({ queryKey: queryKeys.clockify.entrySync() }) > 0
  const todaySyncedEntries = useSyncedClockifyEntriesForPeriod('today', {
    userId: userQuery.data?.id,
    workspaceId: selectedWorkspace?.id,
  })
  const weekSyncedEntries = useSyncedClockifyEntriesForPeriod('week', {
    userId: userQuery.data?.id,
    workspaceId: selectedWorkspace?.id,
  })
  const monthSyncedEntries = useSyncedClockifyEntriesForPeriod('month', {
    userId: userQuery.data?.id,
    workspaceId: selectedWorkspace?.id,
  })
  const todayOverlapFixes = useClockifyOverlapFixes(todaySyncedEntries)
  const weekOverlapFixes = useClockifyOverlapFixes(weekSyncedEntries)
  const monthOverlapFixes = useClockifyOverlapFixes(monthSyncedEntries)
  const periodOverlapFixes = {
    month: monthOverlapFixes,
    today: todayOverlapFixes,
    week: weekOverlapFixes,
  } satisfies Record<ClockifyReportPeriodId, ClockifyTimeEntryOverlapFix[]>
  const runningEntry = useMemo(() => {
    const runningEntries = runningEntryQuery.data ?? []
    return runningEntries.find(entry => entry.userId === userQuery.data?.id) ?? runningEntries[0] ?? null
  }, [runningEntryQuery.data, userQuery.data?.id])
  const todayReport = reportQueries[0]?.data
  const weekReport = reportQueries[1]?.data
  const monthReport = reportQueries[2]?.data
  const periodStats = useMemo(
    () =>
      clockifyReportPeriods.map((period, index) =>
        formatReportPeriodStat(period, [todayReport, weekReport, monthReport][index]),
      ),
    [monthReport, todayReport, weekReport],
  )
  const fetching =
    userQuery.isFetching ||
    workspacesQuery.isFetching ||
    runningEntryQuery.isFetching ||
    entrySyncFetching ||
    reportQueries.some(query => query.isFetching)
  const overlapFixes = overlapDialogState?.fixes ?? []
  const fixOverlapMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        overlapFixes.map(fix =>
          clockify.updateTimeEntry(getClockifyTimeEntryOverlapFixBody(fix), {
            params: { id: fix.entry.id!, workspaceId: fix.entry.workspaceId! },
          }),
        ),
      )

      return overlapFixes.length
    },
    onError: error => {
      appToast.error('Could not fix Clockify overlap', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: count => {
      fixOverlapDialogRef.current?.close()
      setOverlapDialogState(null)
      appToast.success(count === 1 ? 'Fixed 1 Clockify entry' : `Fixed ${count} Clockify entries`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
    },
  })
  const stopRunningEntryMutation = useMutation({
    mutationFn: (entry: TimeEntryWithRatesDtoV1) =>
      clockify.stopRunningTimeEntry(
        { end: new Date().toISOString() },
        { params: { userId: entry.userId ?? '', workspaceId: entry.workspaceId ?? '' } },
      ),
    onError: error => {
      appToast.error('Could not stop Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: () => {
      appToast.success('Stopped Clockify timer')
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })

  return (
    <>
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
            <button
              className="btn btn-square btn-ghost btn-sm"
              type="button"
              aria-label={entriesVisible ? 'Hide Clockify entries' : 'Show Clockify entries'}
              title={entriesVisible ? 'Hide Clockify entries' : 'Show Clockify entries'}
              onClick={() => setEntriesVisible(current => !current)}>
              {entriesVisible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            </button>
            <ClockifyStatusBadge running={Boolean(runningEntry)} />
          </div>
        </header>

        <div className="divide-base-content/5 grid divide-y lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:divide-x lg:divide-y-0">
          <div className="grid min-h-44 content-center gap-2 px-4 py-3">
            {runningEntry ? (
              <RunningTimerView
                key={runningEntry.id ?? runningEntry.timeInterval?.start ?? 'running-entry'}
                entry={runningEntry}
                stopping={stopRunningEntryMutation.isPending}
                onStop={entry => stopRunningEntryMutation.mutate(entry)}
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
                <div className="text-base-content/60 flex min-w-0 items-center gap-2 text-xs font-medium tracking-wide uppercase">
                  <PeriodStatIcon label={stat.label} />
                  {stat.label}
                </div>
                <div className="text-xl leading-7 font-semibold tabular-nums">{stat.time}</div>
                <div className="text-base-content/60 text-sm tabular-nums">{stat.amount}</div>
                {periodOverlapFixes[stat.id].length ? (
                  <div>
                    <button
                      className="badge badge-error badge-sm cursor-pointer gap-1 border-0 tracking-normal normal-case disabled:cursor-not-allowed"
                      type="button"
                      aria-label="Fix Clockify overlap"
                      title="Fix Clockify overlap"
                      disabled={fixOverlapMutation.isPending}
                      onClick={() => {
                        setOverlapDialogState({ fixes: periodOverlapFixes[stat.id], label: stat.label })
                        fixOverlapDialogRef.current?.showModal()
                      }}>
                      {fixOverlapMutation.isPending ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <IconWand className="size-3" />
                      )}
                      Overlap detected
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {entriesVisible ? <TodayClockifyEntriesTable entries={todaySyncedEntries} /> : null}
      </section>

      <dialog ref={fixOverlapDialogRef} className="modal">
        <div className="modal-box max-w-4xl rounded-lg">
          <form
            className="grid gap-5"
            onSubmit={event => {
              event.preventDefault()
              fixOverlapMutation.mutate()
            }}>
            <div className="grid gap-1">
              <h3 className="text-lg leading-7 font-semibold">Fix {overlapDialogState?.label ?? 'Clockify'} overlap</h3>
              <p className="text-base-content/60 text-sm">Review the time-entry changes before updating Clockify.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="table-zebra table-sm table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {overlapFixes.map(fix => (
                    <tr key={fix.entry.id ?? `${fix.start.toISOString()}-${fix.end.toISOString()}`}>
                      <td className="max-w-80 truncate">{getEntryTitle(fix.entry)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {formatDatedTimeRange(fix.entry.timeInterval?.start, fix.entry.timeInterval?.end)}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {formatDatedTimeRange(fix.start.toISOString(), fix.end.toISOString())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-action mt-0">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={fixOverlapMutation.isPending}
                onClick={() => fixOverlapDialogRef.current?.close()}>
                Cancel
              </button>
              <button
                className="btn btn-error"
                type="submit"
                disabled={fixOverlapMutation.isPending || !overlapFixes.length}>
                {fixOverlapMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
                Fix
              </button>
            </div>
          </form>
        </div>

        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
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

function useSyncedClockifyEntriesForPeriod(
  period: ClockifyReportPeriodId,
  {
    userId,
    workspaceId,
  }: {
    userId: string | undefined
    workspaceId: string | undefined
  },
) {
  const range = getClockifyPeriodRange(period, new Date())
  const rangeStart = range.start.toISOString()
  const rangeEnd = range.end.toISOString()
  const syncedEntriesQuery = useLiveQuery(
    q => {
      if (!userId || !workspaceId) {
        return null
      }

      return q
        .from({ syncedEntry: clockifyTimeEntriesCollection })
        .where(({ syncedEntry }) =>
          and(
            eq(syncedEntry.userId, userId),
            eq(syncedEntry.workspaceId, workspaceId),
            gte(syncedEntry.startedAt, rangeStart),
            lt(syncedEntry.startedAt, rangeEnd),
          ),
        )
        .orderBy(({ syncedEntry }) => syncedEntry.startedAt)
    },
    [rangeEnd, rangeStart, userId, workspaceId],
  )

  return syncedEntriesQuery.data ?? []
}

function useClockifyOverlapFixes(entries: SyncedClockifyTimeEntry[]) {
  return useMemo(
    () =>
      getCompletedClockifyTimeEntryOverlapFixes(entries.map(syncedEntry => syncedEntry.entry)).filter(
        fix => fix.entry.id && fix.entry.workspaceId,
      ),
    [entries],
  )
}

function TodayClockifyEntriesTable({ entries }: { entries: SyncedClockifyTimeEntry[] }) {
  return (
    <div className="border-base-content/5 border-t px-4 py-3">
      <div className="overflow-x-auto">
        <table className="table-zebra table-sm table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>Time</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {entries.length ? (
              entries.map(syncedEntry => (
                <tr key={syncedEntry.id}>
                  <td className="max-w-80 truncate">{getEntryTitle(syncedEntry.entry)}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatTimeRange(syncedEntry.entry.timeInterval?.start, syncedEntry.entry.timeInterval?.end)}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{formatEntryDuration(syncedEntry.entry)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="text-base-content/60" colSpan={3}>
                  No synced Clockify entries for today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RunningTimerView({
  entry,
  onStop,
  stopping,
}: {
  entry: TimeEntryWithRatesDtoV1
  onStop: (entry: TimeEntryWithRatesDtoV1) => void
  stopping: boolean
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="grid min-w-0 gap-2">
        <div className="text-base-content/60 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <IconClockPlay className="size-4" />
          Timer
        </div>
        <RunningTimerElapsed start={entry.timeInterval?.start} />
        <div className="text-base-content/60 truncate text-sm">{getEntryTitle(entry)}</div>
      </div>

      <button
        aria-label="Stop Clockify timer"
        className="time-tracking-action-button btn btn-square btn-ghost text-error hover:bg-error/10 size-10 min-h-10"
        title="Stop Clockify timer"
        type="button"
        disabled={stopping}
        onClick={() => onStop(entry)}>
        {stopping ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <IconPlayerStop className="pointer-events-none size-5" />
        )}
      </button>
    </div>
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

function formatReportPeriodStat(
  period: (typeof clockifyReportPeriods)[number],
  report: TimeEntrySummaryReportDto | undefined,
): ClockifyPeriodStat {
  const totals = report?.totals ?? []
  const seconds = totals.reduce((total, entryTotal) => total + (entryTotal.totalTime ?? 0), 0)
  const amount = totals.reduce((total, entryTotal) => {
    const earned = entryTotal.amounts?.find(entryAmount => entryAmount.type === 'EARNED')
    return total + (earned?.value ?? 0) / 100
  }, 0)

  return {
    amount: formatCurrency(amount, 'USD'),
    id: period.id,
    label: period.label,
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

function formatTimeRange(startValue: string | undefined, endValue: string | undefined) {
  return `${formatTime(startValue)} - ${formatTime(endValue)}`
}

function formatDatedTimeRange(startValue: string | undefined, endValue: string | undefined) {
  return `${formatDatedTime(startValue)} - ${formatDatedTime(endValue)}`
}

function formatEntryDuration(entry: TimeEntryWithRatesDtoV1) {
  const start = parseDate(entry.timeInterval?.start)
  const end = parseDate(entry.timeInterval?.end)

  if (!start) {
    return 'n/a'
  }

  return formatShortDuration(Math.max(0, (end?.getTime() ?? Date.now()) - start.getTime()))
}

function formatDatedTime(value: string | undefined) {
  const date = parseDate(value)

  if (!date) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    month: '2-digit',
  }).format(date)
}

function formatTime(value: string | undefined) {
  const date = parseDate(value)

  if (!date) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getClockifyTimeEntryOverlapFixBody(fix: ClockifyTimeEntryOverlapFix): UpdateTimeEntryRequest {
  const { entry } = fix
  const body: UpdateTimeEntryRequest = {
    billable: entry.billable ?? false,
    end: fix.end.toISOString(),
    start: fix.start.toISOString(),
  }

  if (entry.description !== undefined) {
    body.description = entry.description
  }

  if (entry.projectId) {
    body.projectId = entry.projectId
  }

  if (entry.taskId) {
    body.taskId = entry.taskId
  }

  if (entry.tagIds) {
    body.tagIds = entry.tagIds
  }

  if (entry.type === 'REGULAR' || entry.type === 'BREAK') {
    body.type = entry.type
  }

  return body
}

function getClockifyReportPeriodRange(period: ClockifyReportPeriodId, now: Date) {
  const todayStart = getDayStart(now)
  const start = new Date(todayStart)

  switch (period) {
    case 'today':
      break
    case 'week':
      start.setDate(start.getDate() - 6)
      break
    case 'month':
      start.setDate(start.getDate() - 27)
      break
  }

  return { end: now, start }
}

function getClockifyPeriodRange(period: ClockifyReportPeriodId, now: Date) {
  const todayStart = getDayStart(now)
  const start = new Date(todayStart)
  const end = new Date(todayStart)

  switch (period) {
    case 'month':
      start.setDate(start.getDate() - 27)
      end.setDate(end.getDate() - 6)
      break
    case 'today':
      end.setDate(end.getDate() + 1)
      break
    case 'week':
      start.setDate(start.getDate() - 6)
      break
  }

  return { end, start }
}

function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
