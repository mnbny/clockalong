import type { TimeEntryWithRatesDtoV1 } from '../services/clockify/generated/clockify'

import { formatCurrency } from '@automattic/format-currency'
import {
  IconArrowsJoin,
  IconCalendarDue,
  IconCalendarMonth,
  IconCalendarWeek,
  IconClockPlay,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconWand,
} from '@tabler/icons-react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import humanizeDuration from 'humanize-duration'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useStopwatch } from 'react-timer-hook'

import { useDexieQuery } from '../hooks/useDexieQuery'
import { queryKeys } from '../lib/query-client'
import { clockify, clockifyReports } from '../services/clockify/client'
import { getClockifyCollapseGroups } from '../services/clockify/collapse'
import { clockifyCollapseOperationId, collapseClockifyMonthEntries } from '../services/clockify/collapse-entries'
import { clockifyEntryCache } from '../services/clockify/entry-cache'
import { clockifyEntriesInRange } from '../services/clockify/entry-queries'
import { fixClockifyMonthOverlaps } from '../services/clockify/overlap-repair'
import { hasCompletedClockifyTimeEntryOverlap } from '../services/clockify/overlaps'
import { type ClockifyPeriod, getClockifyMonthRange, getClockifyPeriodRange } from '../services/clockify/ranges'
import { cacheClockifyEntryResult, type SyncedClockifyTimeEntry } from '../services/clockify/sync'
import {
  createClockifyTimeEntryFromEntry,
  getClockifyTimeEntryTitle,
  getClockifyTimeEntryUpdateBody,
  stopClockifyTimeEntry,
} from '../services/clockify/time-entries'
import { selectClockifyWorkspace } from '../services/clockify/workspaces'
import { db } from '../services/db'
import { useStorage } from '../services/storage/useStorage'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { ClockifyEntryTimeDialog } from './ClockifyEntryTimeDialog'
import { ClockifyIcon } from './icons/ClockifyIcon'

const clockifyReportPeriods = [
  { id: 'today', label: 'Today', dateRangeType: 'TODAY' },
  { id: 'week', label: 'Week', dateRangeType: 'THIS_WEEK' },
  { id: 'month', label: 'Month', dateRangeType: 'THIS_MONTH' },
] as const
const emptyClockifyEntries: SyncedClockifyTimeEntry[] = []
const clockifyEntryPageSize = 15
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
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyOverrideProject, setClockifyOverrideProject] = useStorage('clockifyOverrideProject')
  const [clockifyOverrideProjectVisibility] = useStorage('clockifyOverrideProjectVisibility')
  const [quickTimersActiveEntry, setQuickTimersActiveEntry] = useStorage('quickTimersActiveEntry')
  const [collapseThresholdMinutes] = useStorage('clockifyCollapseThresholdMinutes')
  const [collapseChunkMinutes] = useStorage('clockifyCollapseChunkMinutes')
  const [collapseExcludeInvoiced] = useStorage('clockifyCollapseExcludeInvoiced')
  const [entriesVisible, setEntriesVisible] = useState(false)
  const [entryTablePeriod, setEntryTablePeriod] = useState<ClockifyPeriod>('today')
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithRatesDtoV1 | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<SyncedClockifyTimeEntry | null>(null)
  const [manualEntry, setManualEntry] = useState<TimeEntryWithRatesDtoV1 | null>(null)
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

    return selectClockifyWorkspace(user, workspaces)
  }, [userQuery.data, workspacesQuery.data])
  const clockifyProjectsQuery = useQuery({
    enabled: clockifyOverrideProjectVisibility && Boolean(selectedWorkspace?.id),
    queryKey: queryKeys.clockify.projects({
      params: { workspaceId: selectedWorkspace?.id },
    }),
    queryFn: () =>
      clockify.getProjects({
        params: { workspaceId: selectedWorkspace!.id! },
        queries: {
          archived: false,
          page: 1,
          'page-size': 100,
          'sort-column': 'NAME',
          'sort-order': 'ASCENDING',
        },
      }),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const clockifyProjectOptions = useMemo(() => {
    if (!selectedWorkspace?.id) {
      return []
    }

    const workspaceId = selectedWorkspace.id

    return (clockifyProjectsQuery.data ?? []).flatMap(project => {
      if (!project.id || !project.name) {
        return []
      }

      return {
        projectId: project.id,
        projectName: project.name,
        workspaceId,
        workspaceName: selectedWorkspace.name ?? 'Clockify workspace',
      }
    })
  }, [clockifyProjectsQuery.data, selectedWorkspace])
  const clockifyOverrideProjectValue = clockifyOverrideProject
    ? `${clockifyOverrideProject.workspaceId}:${clockifyOverrideProject.projectId}`
    : ''
  const selectedClockifyOverrideProjectLoaded = clockifyProjectOptions.some(
    project => `${project.workspaceId}:${project.projectId}` === clockifyOverrideProjectValue,
  )
  const clockifyTimerProject = clockifyOverrideProject ?? clockifyDefaultProject
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
        const settings = userQuery.data?.settings
        const range = getClockifyPeriodRange(period.id, now, settings?.timeZone, settings?.weekStart)

        return clockifyReports.generateSummaryReport(
          {
            amountShown: 'EARNED',
            amounts: ['EARNED'],
            dateRangeEnd: toClockifyReportDate(new Date(range.end.getTime() - 1)),
            dateRangeStart: toClockifyReportDate(range.start),
            dateRangeType: period.dateRangeType,
            exportType: 'JSON',
            rounding: false,
            summaryFilter: {
              groups: ['USER'],
              sortColumn: 'GROUP',
              summaryChartType: 'BILLABILITY',
            },
            ...(settings?.timeZone ? { timeZone: settings.timeZone } : {}),
            users: {
              contains: 'CONTAINS',
              ids: [userQuery.data!.id!],
              status: 'ACTIVE',
            },
            weekStart: settings?.weekStart ?? 'MONDAY',
          },
          { params: { workspaceId: selectedWorkspace!.id! } },
        )
      },
      refetchInterval: 15 * 60_000,
      staleTime: 60_000,
    })),
  })
  const entryTableRange = getClockifyPeriodRange(
    entryTablePeriod,
    new Date(),
    userQuery.data?.settings?.timeZone,
    userQuery.data?.settings?.weekStart,
  )
  const entryTableEntriesQuery = useSyncedClockifyEntriesForRange(entryTableRange, {
    userId: userQuery.data?.id,
    workspaceId: selectedWorkspace?.id,
  })
  const monthEntriesQuery = useSyncedClockifyEntriesForRange(
    { start: getClockifyMonthRange(new Date(), userQuery.data?.settings?.timeZone).start },
    { userId: userQuery.data?.id, workspaceId: selectedWorkspace?.id },
  )
  const monthSyncedEntries = monthEntriesQuery.data ?? emptyClockifyEntries
  const entryTableSyncedEntries = useMemo(
    () => entryTableEntriesQuery.data?.slice().reverse() ?? emptyClockifyEntries,
    [entryTableEntriesQuery.data],
  )
  const readPendingCollapse = useCallback(
    () =>
      userQuery.data?.id && selectedWorkspace?.id
        ? db.clockifyCollapses.get(
            clockifyCollapseOperationId({ userId: userQuery.data.id, workspaceId: selectedWorkspace.id }),
          )
        : Promise.resolve(undefined),
    [userQuery.data?.id, selectedWorkspace?.id],
  )
  const pendingCollapseQuery = useDexieQuery(
    readPendingCollapse,
    JSON.stringify([userQuery.data?.id, selectedWorkspace?.id]),
  )
  const entryQueries = [monthEntriesQuery, entryTableEntriesQuery, pendingCollapseQuery]
  const entryReadError = entryQueries.find(query => query.error)?.error
  const hasMonthOverlap = useMemo(
    () => hasCompletedClockifyTimeEntryOverlap(monthSyncedEntries.map(row => row.entry)),
    [monthSyncedEntries],
  )
  const collapseGroups = useMemo(
    () =>
      getClockifyCollapseGroups(
        monthSyncedEntries.map(row => row.entry),
        {
          thresholdMinutes: collapseThresholdMinutes,
          chunkMinutes: collapseChunkMinutes,
          excludeInvoiced: collapseExcludeInvoiced,
        },
      ),
    [monthSyncedEntries, collapseThresholdMinutes, collapseChunkMinutes, collapseExcludeInvoiced],
  )
  const runningEntry = useMemo(() => {
    const runningEntries = runningEntryQuery.data ?? []
    return runningEntries.find(entry => entry.userId === userQuery.data?.id) ?? runningEntries[0] ?? null
  }, [runningEntryQuery.data, userQuery.data?.id])
  const todayReport = reportQueries[0]?.data
  const weekReport = reportQueries[1]?.data
  const monthReport = reportQueries[2]?.data
  const periodStats = useMemo(
    () =>
      clockifyReportPeriods.map((period, index) => {
        const totals = [todayReport, weekReport, monthReport][index]?.totals ?? []
        const seconds = totals.reduce((total, entryTotal) => total + (entryTotal.totalTime ?? 0), 0)
        const amount = totals.reduce((total, entryTotal) => {
          const earned = entryTotal.amounts?.find(entryAmount => entryAmount.type === 'EARNED')
          return total + (earned?.value ?? 0) / 100
        }, 0)

        return {
          amount: formatCurrency(amount, 'USD'),
          label: period.label,
          time: formatShortDuration(seconds * 1000),
        }
      }),
    [monthReport, todayReport, weekReport],
  )
  useEffect(() => {
    clockifyWidgetLog('synced entries live query', {
      month: summarizeSyncedEntryLog(monthSyncedEntries),
      userId: userQuery.data?.id,
      workspaceId: selectedWorkspace?.id,
    })
  }, [monthSyncedEntries, selectedWorkspace?.id, userQuery.data?.id])
  const fixOverlapMutation = useMutation({
    mutationFn: () => {
      if (!userQuery.data?.id || !selectedWorkspace?.id) throw new Error('Clockify is not ready.')
      return fixClockifyMonthOverlaps(
        { userId: userQuery.data.id, workspaceId: selectedWorkspace.id },
        userQuery.data.settings?.timeZone,
      )
    },
    onError: error => {
      appToast.error('Could not fix Clockify overlaps', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: ({ updatedCount, refreshFailed }) => {
      appToast.success(
        updatedCount === 0
          ? 'No Clockify overlaps this month'
          : updatedCount === 1
            ? 'Fixed 1 Clockify entry'
            : `Fixed ${updatedCount} Clockify entries`,
      )
      if (refreshFailed) appToast.warning('Could not refresh Clockify after the repair. Sync to update the display.')
    },
  })
  const collapseMutation = useMutation({
    mutationFn: () => {
      if (!userQuery.data?.id || !selectedWorkspace?.id) throw new Error('Clockify is not ready.')
      return collapseClockifyMonthEntries(
        { userId: userQuery.data.id, workspaceId: selectedWorkspace.id },
        userQuery.data.settings?.timeZone,
      )
    },
    onError: error => {
      appToast.error('Could not collapse Clockify entries', { description: getErrorMessage(error) })
    },
    onSuccess: ({ createdCount, deletedCount, refreshFailed }) => {
      appToast.success(
        createdCount
          ? 'Collapsed ' + deletedCount + ' entries into ' + createdCount
          : 'No Clockify entries to collapse this month',
      )
      if (refreshFailed)
        appToast.warning('Could not refresh Clockify after collapsing entries. Sync to update the display.')
    },
  })
  const resumeClockifyEntryMutation = useMutation({
    mutationFn: (entry: TimeEntryWithRatesDtoV1) => createClockifyTimeEntryFromEntry(entry, clockifyTimerProject),
    onError: error => {
      appToast.error('Could not resume Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: () => {
      appToast.success('Resumed Clockify timer')
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })
  const stopRunningEntryMutation = useMutation({
    mutationFn: stopClockifyTimeEntry,
    onMutate: () => clockifyEntryCache.getLifecycle(),
    onError: error => {
      appToast.error('Could not stop Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: async (response, original, lifecycle) => {
      try {
        await cacheClockifyEntryResult(response, original, lifecycle)
      } catch (error) {
        console.warn('[clockify sync] Could not cache stopped entry:', error)
        appToast.warning('Timer stopped, but the local cache could not be updated.')
      }
      void setQuickTimersActiveEntry(null)
      appToast.success('Stopped Clockify timer')
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })
  const deleteEntryMutation = useMutation({
    mutationFn: (entry: SyncedClockifyTimeEntry) =>
      clockify.deleteTimeEntry(undefined, { params: { id: entry.id, workspaceId: entry.workspaceId } }),
    onMutate: () => clockifyEntryCache.getLifecycle(),
    onError: error => {
      appToast.error('Could not delete Clockify entry', { description: getErrorMessage(error) })
    },
    onSuccess: async (_, entry, lifecycle) => {
      try {
        await clockifyEntryCache.remove(entry.id, entry, lifecycle)
      } catch (error) {
        console.warn('[clockify sync] Could not remove deleted entry from cache:', error)
        appToast.warning('Entry deleted, but the local cache could not be updated. Sync to update the display.')
      }
      setDeletingEntry(null)
      if (lifecycle !== clockifyEntryCache.getLifecycle()) return
      if (quickTimersActiveEntry?.entryId === entry.id) {
        void setQuickTimersActiveEntry(current => (current?.entryId === entry.id ? null : current))
      }
      appToast.success('Clockify entry deleted')
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
    },
  })

  return (
    <>
      <section className="card card-border bg-base-200/10 dark:bg-base-200/40">
        <div className="card-body gap-0 p-0">
          <header className="border-base-content/5 flex min-w-0 items-center justify-between gap-4 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-4">
              <ClockifyIcon className="text-primary size-6" />
              <div className="min-w-0">
                <h2 className="text-base leading-6 font-semibold">Clockify</h2>
                <p className="text-base-content/60 truncate text-sm">Time tracker</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {clockifyOverrideProjectVisibility && (
                <div className="flex min-w-0 items-center gap-2">
                  <select
                    aria-label="Clockify project override"
                    className="select select-bordered select-sm max-w-52 min-w-0"
                    disabled={
                      userQuery.isLoading ||
                      workspacesQuery.isLoading ||
                      clockifyProjectsQuery.isLoading ||
                      userQuery.isError ||
                      workspacesQuery.isError ||
                      clockifyProjectsQuery.isError ||
                      !clockifyProjectOptions.length
                    }
                    title="Project override"
                    value={clockifyOverrideProjectValue}
                    onChange={event => {
                      const selectedProject = clockifyProjectOptions.find(
                        project => `${project.workspaceId}:${project.projectId}` === event.currentTarget.value,
                      )

                      void setClockifyOverrideProject(selectedProject ?? null)
                    }}>
                    <option value="">Use default project</option>
                    {!!clockifyOverrideProjectValue &&
                      !selectedClockifyOverrideProjectLoaded &&
                      !!clockifyOverrideProject && (
                        <option value={clockifyOverrideProjectValue}>
                          {`${clockifyOverrideProject.workspaceName} / ${clockifyOverrideProject.projectName}`}
                        </option>
                      )}
                    {clockifyProjectOptions.map(project => (
                      <option
                        key={`${project.workspaceId}:${project.projectId}`}
                        value={`${project.workspaceId}:${project.projectId}`}>
                        {`${project.workspaceName} / ${project.projectName}`}
                      </option>
                    ))}
                  </select>
                  {clockifyProjectsQuery.isFetching && <span className="loading loading-spinner loading-xs" />}
                </div>
              )}
              <button
                className="btn btn-square btn-ghost btn-sm"
                type="button"
                aria-label={entriesVisible ? 'Hide Clockify entries' : 'Show Clockify entries'}
                title={entriesVisible ? 'Hide Clockify entries' : 'Show Clockify entries'}
                onClick={() => {
                  clockifyWidgetLog('entries visibility toggled', {
                    nextVisible: !entriesVisible,
                    entries: summarizeSyncedEntryLog(entryTableSyncedEntries),
                    userId: userQuery.data?.id,
                    workspaceId: selectedWorkspace?.id,
                  })
                  setEntriesVisible(current => !current)
                }}>
                {entriesVisible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
              {(!!collapseGroups.length || !!pendingCollapseQuery.data) && (
                <button
                  className="badge badge-primary badge-sm cursor-pointer gap-1 border-0 tracking-normal normal-case disabled:cursor-not-allowed"
                  type="button"
                  aria-label="Collapse entries this month"
                  title="Collapse entries this month"
                  disabled={collapseMutation.isPending || !userQuery.data?.id || !selectedWorkspace?.id}
                  onClick={() => collapseMutation.mutate()}>
                  {collapseMutation.isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <IconArrowsJoin className="size-3" />
                  )}
                  {pendingCollapseQuery.data && !collapseMutation.isPending ? 'Resume collapse' : 'Collapse entries'}
                </button>
              )}
              {hasMonthOverlap && (
                <button
                  className="badge badge-error badge-sm cursor-pointer gap-1 border-0 tracking-normal normal-case disabled:cursor-not-allowed"
                  type="button"
                  aria-label="Fix overlaps this month"
                  title="Fix overlaps this month"
                  disabled={fixOverlapMutation.isPending || !userQuery.data?.id || !selectedWorkspace?.id}
                  onClick={() => fixOverlapMutation.mutate()}>
                  {fixOverlapMutation.isPending ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <IconWand className="size-3" />
                  )}
                  Fix overlaps
                </button>
              )}
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
                </div>
              ))}
            </div>
          </div>

          {!!entryReadError && (
            <div role="alert" className="text-error px-4 py-2">
              Could not read Clockify entries: {getErrorMessage(entryReadError)}{' '}
              <button type="button" className="btn btn-sm" onClick={() => entryQueries.forEach(query => query.retry())}>
                Retry
              </button>
            </div>
          )}
          {entriesVisible &&
            !entryReadError &&
            (entryTableEntriesQuery.data ? (
              <ClockifyEntriesTable
                key={JSON.stringify([userQuery.data?.id, selectedWorkspace?.id, entryTablePeriod, entryTableRange])}
                activeEntryId={runningEntry?.id ?? null}
                entries={entryTableSyncedEntries}
                period={entryTablePeriod}
                pending={entryTableEntriesQuery.isPending}
                timeZone={userQuery.data?.settings?.timeZone}
                onEdit={setEditingEntry}
                onDelete={setDeletingEntry}
                onAddTime={setManualEntry}
                onPeriodChange={setEntryTablePeriod}
                onResume={entry => resumeClockifyEntryMutation.mutate(entry)}
                onStop={entry => stopRunningEntryMutation.mutate(entry)}
                resumingEntryId={
                  resumeClockifyEntryMutation.isPending ? resumeClockifyEntryMutation.variables?.id : null
                }
                stoppingEntryId={stopRunningEntryMutation.isPending ? stopRunningEntryMutation.variables?.id : null}
              />
            ) : (
              <p className="px-4 py-2">Loading Clockify entries…</p>
            ))}
        </div>
      </section>

      {!!editingEntry && (
        <ClockifyEntryTimeDialog
          description={getClockifyTimeEntryTitle(editingEntry)}
          entry={editingEntry}
          onCancel={() => setEditingEntry(null)}
          onSave={({ start, end }) => {
            if (!editingEntry.id || !editingEntry.workspaceId)
              throw new Error('Clockify entry is missing its ID or workspace.')
            return clockify.updateTimeEntry(
              getClockifyTimeEntryUpdateBody(editingEntry, new Date(start), new Date(end)),
              {
                params: { id: editingEntry.id, workspaceId: editingEntry.workspaceId },
              },
            )
          }}
        />
      )}
      {!!manualEntry && (
        <ClockifyEntryTimeDialog
          description={getClockifyTimeEntryTitle(manualEntry)}
          workspaceId={clockifyTimerProject?.workspaceId ?? manualEntry.workspaceId}
          onCancel={() => setManualEntry(null)}
          onSave={interval => createClockifyTimeEntryFromEntry(manualEntry, clockifyTimerProject, interval)}
        />
      )}
      {!!deletingEntry && (
        <ClockifyEntryDeleteDialog
          entry={deletingEntry.entry}
          timeZone={userQuery.data?.settings?.timeZone}
          pending={deleteEntryMutation.isPending}
          onCancel={() => setDeletingEntry(null)}
          onConfirm={() => {
            if (!deleteEntryMutation.isPending) deleteEntryMutation.mutate(deletingEntry)
          }}
        />
      )}
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

function useSyncedClockifyEntriesForRange(
  range: { start: Date; end?: Date },
  { userId, workspaceId }: { userId: string | undefined; workspaceId: string | undefined },
) {
  const rangeStart = range.start.toISOString()
  const rangeEnd = range.end?.toISOString()
  const read = useCallback(
    () =>
      userId && workspaceId
        ? clockifyEntriesInRange(db, { userId, workspaceId }, rangeStart, rangeEnd ?? new Date().toISOString())
        : Promise.resolve([]),
    [userId, workspaceId, rangeStart, rangeEnd],
  )
  return useDexieQuery(read, JSON.stringify([userId, workspaceId]))
}

function summarizeSyncedEntryLog(entries: SyncedClockifyTimeEntry[]) {
  return {
    count: entries.length,
    sample: entries.slice(0, 5).map(entry => ({
      description: truncateLogText(entry.entry.description),
      end: entry.entry.timeInterval?.end,
      id: entry.id,
      startedAt: entry.startedAt,
      syncedAt: entry.syncedAt,
      userId: entry.userId,
      workspaceId: entry.workspaceId,
    })),
  }
}

function truncateLogText(value: string | undefined, maxLength = 140) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function ClockifyEntriesTable({
  activeEntryId,
  entries,
  period,
  pending,
  timeZone,
  onEdit,
  onDelete,
  onPeriodChange,
  onAddTime,
  onResume,
  onStop,
  resumingEntryId,
  stoppingEntryId,
}: {
  activeEntryId: string | null
  entries: SyncedClockifyTimeEntry[]
  period: ClockifyPeriod
  pending: boolean
  timeZone?: string
  onEdit: (entry: TimeEntryWithRatesDtoV1) => void
  onDelete: (entry: SyncedClockifyTimeEntry) => void
  onPeriodChange: (period: ClockifyPeriod) => void
  onAddTime: (entry: TimeEntryWithRatesDtoV1) => void
  onResume: (entry: TimeEntryWithRatesDtoV1) => void
  onStop: (entry: TimeEntryWithRatesDtoV1) => void
  resumingEntryId: string | null | undefined
  stoppingEntryId: string | null | undefined
}) {
  const [page, setPage] = useState(0)
  const paginated = period !== 'today'
  const lastPage = paginated ? Math.max(0, Math.ceil(entries.length / clockifyEntryPageSize) - 1) : 0
  const currentPage = Math.min(page, lastPage)
  const visibleEntries = paginated
    ? entries.slice(currentPage * clockifyEntryPageSize, (currentPage + 1) * clockifyEntryPageSize)
    : entries
  useEffect(() => {
    if (page > lastPage) setPage(lastPage)
  }, [page, lastPage])

  return (
    <div className="border-base-content/5 grid gap-3 border-t px-4 py-3">
      <div className="flex justify-end">
        <div className="join" role="group" aria-label="Clockify entry date range">
          {clockifyReportPeriods.map(option => (
            <button
              key={option.id}
              className={period === option.id ? 'btn btn-primary btn-sm join-item' : 'btn btn-sm join-item'}
              type="button"
              aria-pressed={period === option.id}
              onClick={() => onPeriodChange(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-zebra table-sm table w-full table-fixed">
          <colgroup>
            <col className="w-12" />
            <col className="w-full" />
            <col className="w-48" />
            <col className="w-24" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr>
              <th className="w-12 min-w-12 text-center">
                <span className="sr-only">Track time</span>
              </th>
              <th className="w-full min-w-0">Entry</th>
              <th className="whitespace-nowrap">{period === 'today' ? 'Time' : 'Date & time'}</th>
              <th className="whitespace-nowrap">Duration</th>
              <th className="w-20 min-w-20 text-center">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length ? (
              visibleEntries.map(syncedEntry => (
                <tr key={syncedEntry.id}>
                  <td className="w-12 min-w-12 text-center">
                    <ClockifyEntryTrackingButton
                      active={syncedEntry.id === activeEntryId}
                      entry={syncedEntry.entry}
                      onAddTime={onAddTime}
                      onResume={onResume}
                      onStop={onStop}
                      resuming={resumingEntryId === syncedEntry.id}
                      stopping={stoppingEntryId === syncedEntry.id}
                    />
                  </td>
                  <td className="w-full min-w-0" title={getClockifyTimeEntryTitle(syncedEntry.entry)}>
                    <div className="truncate">{getClockifyTimeEntryTitle(syncedEntry.entry)}</div>
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatEntryTimeRange(
                      syncedEntry.entry.timeInterval?.start,
                      syncedEntry.entry.timeInterval?.end,
                      period !== 'today',
                      timeZone,
                    )}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">{formatEntryDuration(syncedEntry.entry)}</td>
                  <td className="w-20 min-w-20 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        className="btn btn-square btn-ghost text-primary hover:bg-primary/10 btn-xs"
                        type="button"
                        aria-label={`Edit ${getClockifyTimeEntryTitle(syncedEntry.entry)}`}
                        title="Edit entry"
                        disabled={!syncedEntry.entry.id || !syncedEntry.entry.workspaceId}
                        onClick={() => onEdit(syncedEntry.entry)}>
                        <IconPencil className="size-3.5" />
                      </button>
                      <button
                        className="btn btn-square btn-ghost text-error hover:bg-error/10 btn-xs"
                        type="button"
                        aria-label={`Delete ${getClockifyTimeEntryTitle(syncedEntry.entry)}`}
                        title="Delete entry"
                        onClick={() => onDelete(syncedEntry)}>
                        <IconTrash className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="text-base-content/60" colSpan={5}>
                  No synced Clockify entries for the selected range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginated && lastPage > 0 && (
        <div className="flex justify-end gap-2">
          <button
            className="btn btn-sm"
            type="button"
            disabled={pending || currentPage === 0}
            onClick={() => setPage(currentPage - 1)}>
            Previous
          </button>
          <button
            className="btn btn-sm"
            type="button"
            disabled={pending || currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function ClockifyEntryDeleteDialog({
  entry,
  timeZone,
  pending,
  onCancel,
  onConfirm,
}: {
  entry: TimeEntryWithRatesDtoV1
  timeZone?: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onClose={onCancel}
      onCancel={event => {
        if (pending) event.preventDefault()
      }}>
      <div className="modal-box grid max-w-lg gap-5 rounded-lg">
        <div className="grid gap-1">
          <h3 id={titleId} className="text-lg leading-7 font-semibold">
            Delete Clockify entry?
          </h3>
          <p className="text-base-content/60 text-sm">This permanently deletes the entry from Clockify.</p>
        </div>
        <div className="grid gap-1">
          <p className="text-sm wrap-anywhere">{getClockifyTimeEntryTitle(entry)}</p>
          <p className="text-base-content/60 text-xs tabular-nums">
            {formatEntryTimeRange(entry.timeInterval?.start, entry.timeInterval?.end, true, timeZone)} ·{' '}
            {formatEntryDuration(entry)}
          </p>
        </div>
        <div className="modal-action mt-0">
          <button className="btn btn-ghost" type="button" autoFocus disabled={pending} onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-error" type="button" disabled={pending} onClick={onConfirm}>
            {pending && <span className="loading loading-spinner loading-xs" />}
            {pending ? 'Deleting…' : 'Delete entry'}
          </button>
        </div>
      </div>
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Cancel deletion"
        disabled={pending}
        onClick={onCancel}
      />
    </dialog>
  )
}

function ClockifyEntryTrackingButton({
  active,
  entry,
  onAddTime,
  onResume,
  onStop,
  resuming,
  stopping,
}: {
  active: boolean
  entry: TimeEntryWithRatesDtoV1
  onAddTime: (entry: TimeEntryWithRatesDtoV1) => void
  onResume: (entry: TimeEntryWithRatesDtoV1) => void
  onStop: (entry: TimeEntryWithRatesDtoV1) => void
  resuming: boolean
  stopping: boolean
}) {
  const entryTitle = getClockifyTimeEntryTitle(entry)

  if (active) {
    return (
      <button
        aria-label={`Stop Clockify timer for ${entryTitle}`}
        className="time-tracking-action-button btn btn-square btn-ghost text-error hover:bg-error/10 size-10 min-h-10"
        data-time-tracking-action={entry.id}
        title={`Stop Clockify timer for ${entryTitle}`}
        type="button"
        disabled={stopping}
        onClick={() => onStop(entry)}>
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
      aria-label={`Resume Clockify timer for ${entryTitle}`}
      className="time-tracking-action-button btn btn-square btn-ghost text-primary hover:bg-primary/10 size-10 min-h-10"
      data-time-tracking-action={entry.id}
      title={`Resume Clockify timer for ${entryTitle} · Right-click or Shift+F10 to add time`}
      type="button"
      disabled={resuming}
      onContextMenu={event => {
        event.preventDefault()
        onAddTime(entry)
      }}
      onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          onAddTime(entry)
        }
      }}
      onClick={() => onResume(entry)}>
      {resuming ? (
        <span className="loading loading-spinner loading-xs" />
      ) : (
        <IconPlayerPlay className="pointer-events-none size-5" />
      )}
    </button>
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
        <div className="text-base-content/60 truncate text-sm">{getClockifyTimeEntryTitle(entry)}</div>
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

function formatEntryTimeRange(
  startValue: string | undefined,
  endValue: string | undefined,
  includeDate: boolean,
  timeZone?: string,
) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: includeDate ? '2-digit' : undefined,
    month: includeDate ? '2-digit' : undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
  return [startValue, endValue]
    .map(value => {
      const date = parseDate(value)
      return date ? formatter.format(date) : 'n/a'
    })
    .join(' - ')
}

function formatEntryDuration(entry: TimeEntryWithRatesDtoV1) {
  const start = parseDate(entry.timeInterval?.start)
  const end = parseDate(entry.timeInterval?.end)

  if (!start) {
    return 'n/a'
  }

  return formatShortDuration(Math.max(0, (end?.getTime() ?? Date.now()) - start.getTime()))
}

function clockifyWidgetLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify widget] ${message}`)
    return
  }

  console.info(`[clockify widget] ${message}`, details)
}
