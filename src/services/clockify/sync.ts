import type { StoredClockifyTimeEntry } from './entry-cache'
import type { TimeEntryWithRatesDtoV1, UserDtoV1, WorkspaceDtoV1 } from './generated/clockify'
import type { PropsWithChildren } from 'react'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useMemo } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryClient, queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { parseInternalRefs } from '../../utils/templates'
import { storage } from '../storage/config'
import { useStorage } from '../storage/useStorage'
import { clockify } from './client'
import { clockifyEntryCache } from './entry-cache'
import { formatClockifyEntryFilterDate } from './ranges'
import {
  type ClockifyEntrySyncDaysOption,
  type ClockifyEntrySyncIntervalOption,
  getClockifyEntrySyncIntervalMilliseconds,
} from './sync-settings'
import { selectClockifyWorkspace } from './workspaces'

const clockifyEntrySyncPageSize = 100
export type SyncedClockifyTimeEntry = {
  entry: StoredClockifyTimeEntry
  id: string
  startedAt: string
  syncedAt: string
  userId: string
  workspaceId: string
}

type ClockifyEntrySyncOptions = {
  workspaceId: string
  userId: string
  start?: Date
}

type ClockifyEntrySyncResult = {
  entriesDeleted: number
  entriesFetched: number
  entriesStored: number
  entriesInserted: number
  entriesUpdated: number
  githubRefEntriesFetched: number
  linearRefEntriesFetched: number
  pagesFetched: number
  skippedEntries: number
  start: string
  syncedAt: string
}

function useClockifySyncData() {
  const authState = useAppAuth()
  const [clockifyEntrySyncInterval] = useStorage('clockifyEntrySyncInterval')
  const clockifyAuthenticated = authState.value.clockifyAuthenticated && !authState.loading
  const userQuery = useQuery({
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    enabled: clockifyAuthenticated,
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const workspacesQuery = useQuery({
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    enabled: clockifyAuthenticated,
    retry: 1,
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
  const userId = userQuery.data?.id
  const workspaceId = selectedWorkspace?.id
  const syncEnabled = Boolean(clockifyAuthenticated && userId && workspaceId)
  const syncQuery = useQuery(
    clockifyEntrySyncQueryOptions({ userId, workspaceId, enabled: syncEnabled, interval: clockifyEntrySyncInterval }),
  )
  const syncNow = useCallback(() => syncQuery.refetch(), [syncQuery])

  return {
    lastSyncResult: syncQuery.data ?? null,
    syncNow,
    queries: {
      syncQuery,
    },
    syncing: syncQuery.isFetching,
  }
}

export function clockifyEntrySyncQueryOptions({
  userId,
  workspaceId,
  enabled,
  interval,
}: {
  userId: string | undefined
  workspaceId: string | undefined
  enabled: boolean
  interval: ClockifyEntrySyncIntervalOption
}) {
  return queryOptions({
    queryKey: queryKeys.clockify.entrySync({
      params: { userId, workspaceId },
    }),
    queryFn: () => syncClockifyEntries({ userId: userId!, workspaceId: workspaceId! }),
    enabled,
    refetchInterval: getClockifyEntrySyncIntervalMilliseconds(interval),
    staleTime: 60_000,
  })
}

type ClockifySyncContext = ReturnType<typeof useClockifySyncData>
const ClockifySyncContext = createContext<ClockifySyncContext | null>(null)

export function ClockifySyncProvider(props: PropsWithChildren) {
  const data = useClockifySyncData()

  return createElement(ClockifySyncContext.Provider, { value: data }, props.children)
}

export function useClockifySync() {
  const context = useContext(ClockifySyncContext)
  if (!context) throw new Error('useClockifySync must be used within a ClockifySyncProvider')
  return context
}

export async function clearSyncedClockifyTimeEntries() {
  return clockifyEntryCache.clear()
}

export async function syncClockifyEntries({ userId, workspaceId, start: requestedStart }: ClockifyEntrySyncOptions) {
  const generation = clockifyEntryCache.beginSync()
  const now = new Date()
  const initialRevision = await clockifyEntryCache.getRevision()
  const syncDays = await storage.get('clockifyEntrySyncDays')
  const startDate = requestedStart ?? getClockifyEntrySyncStart(syncDays, now)
  const start = startDate.toISOString()
  const timeZone = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)?.settings?.timeZone
  const queryStart = formatClockifyEntryFilterDate(startDate, timeZone)
  const syncedAt = new Date().toISOString()
  const refCounts = {
    github: 0,
    linear: 0,
  }
  const entriesToSync: TimeEntryWithRatesDtoV1[] = []
  let page = 1
  let entriesFetched = 0
  let entriesInserted = 0
  let entriesStored = 0
  let entriesUpdated = 0
  let pagesFetched = 0
  let skippedEntries = 0

  clockifySyncLog('entry sync start', {
    start,
    syncDays,
    syncedAt,
    userId,
    workspaceId,
  })

  try {
    while (true) {
      const entries = await clockify.getTimeEntries({
        params: { workspaceId, userId },
        queries: {
          hydrated: true,
          page,
          'page-size': clockifyEntrySyncPageSize,
          start: queryStart,
        },
      })
      const pageRefCounts = getClockifyEntryRefCounts(entries)

      pagesFetched += 1
      entriesFetched += entries.length
      refCounts.github += pageRefCounts.github
      refCounts.linear += pageRefCounts.linear

      entriesToSync.push(...entries)

      clockifySyncLog('entry sync page fetched', {
        entriesFetched: entries.length,
        page,
        refCounts: pageRefCounts,
        sample: entries.slice(0, 5).map(getClockifyEntrySyncLog),
      })

      if (entries.length < clockifyEntrySyncPageSize) {
        break
      }

      page += 1
    }

    const currentUser = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)
    const currentWorkspaces = queryClient.getQueryData<WorkspaceDtoV1[]>(queryKeys.clockify.workspaces)
    const currentWorkspace = selectClockifyWorkspace(currentUser, currentWorkspaces)
    if (
      (currentUser?.id && currentUser.id !== userId) ||
      (currentWorkspace?.id && currentWorkspace.id !== workspaceId)
    ) {
      throw new Error('Clockify account or workspace changed during sync')
    }
    const upsertResult = await clockifyEntryCache.reconcile(
      { userId, workspaceId },
      entriesToSync,
      start,
      now.toISOString(),
      syncedAt,
      generation,
      initialRevision,
    )
    entriesInserted += upsertResult.inserted
    entriesStored += upsertResult.stored
    entriesUpdated += upsertResult.updated
    skippedEntries += upsertResult.skipped
    const entriesDeleted = upsertResult.deleted

    const result = {
      entriesDeleted,
      entriesFetched,
      entriesInserted,
      entriesStored,
      entriesUpdated,
      githubRefEntriesFetched: refCounts.github,
      linearRefEntriesFetched: refCounts.linear,
      pagesFetched,
      skippedEntries,
      start,
      syncedAt,
    } satisfies ClockifyEntrySyncResult

    clockifySyncLog('entry sync complete', result)

    return result
  } catch (error) {
    clockifySyncLog('entry sync failed', {
      error: getErrorMessage(error),
      page,
      start,
      syncedAt,
      userId,
      workspaceId,
    })
    throw error
  }
}

export async function cacheClockifyEntryResult(
  response: TimeEntryWithRatesDtoV1,
  fallback: TimeEntryWithRatesDtoV1 = {},
  lifecycle = clockifyEntryCache.getLifecycle(),
) {
  const entry = {
    ...fallback,
    ...response,
    timeInterval: { ...fallback.timeInterval, ...response.timeInterval },
  }
  const currentUserId = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)?.id
  const userId = entry.userId ?? currentUserId
  if (!entry.id || !userId || !entry.workspaceId) return false
  if (currentUserId && currentUserId !== userId) return false
  const result = await clockifyEntryCache.upsert(
    entry,
    { userId, workspaceId: entry.workspaceId },
    undefined,
    lifecycle,
  )
  return result.stored > 0
}

export function getClockifyEntrySyncStart(days: ClockifyEntrySyncDaysOption, now: Date) {
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  return start
}

function getClockifyEntryRefCounts(entries: TimeEntryWithRatesDtoV1[]) {
  let github = 0
  let linear = 0

  for (const entry of entries) {
    const refs = parseInternalRefs(entry.description)

    if (refs.some(ref => ref.provider === 'github')) {
      github += 1
    }

    if (refs.some(ref => ref.provider === 'linear')) {
      linear += 1
    }
  }

  return { github, linear }
}

function getClockifyEntrySyncLog(entry: TimeEntryWithRatesDtoV1) {
  return {
    description: truncateLogText(entry.description),
    end: entry.timeInterval?.end,
    hasEnd: Boolean(entry.timeInterval?.end),
    id: entry.id,
    refs: parseInternalRefs(entry.description).map(ref => ref.provider),
    start: entry.timeInterval?.start,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  }
}

function truncateLogText(value: string | undefined, maxLength = 180) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function clockifySyncLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify sync] ${message}`)
    return
  }

  console.info(`[clockify sync] ${message}`, details)
}
