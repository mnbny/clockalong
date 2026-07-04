import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'
import type { PropsWithChildren } from 'react'

import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useMemo } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { parseInternalRefs } from '../../utils/templates'
import { storage } from '../storage/config'
import { useStorage } from '../storage/useStorage'
import { clockify } from './client'
import { type ClockifyEntrySyncDaysOption, getClockifyEntrySyncIntervalMilliseconds } from './sync-settings'

const clockifyEntrySyncPageSize = 100
const clockifyEntrySyncStorageKey = 'clockalong.clockify.timeEntries.v1'

export type SyncedClockifyTimeEntry = {
  entry: TimeEntryWithRatesDtoV1
  id: string
  startedAt: string
  syncedAt: string
  userId: string
  workspaceId: string
}

type ClockifyEntrySyncOptions = {
  workspaceId: string
  userId: string
}

type ClockifyEntrySyncResult = {
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

export const clockifyTimeEntriesCollection = createCollection(
  localStorageCollectionOptions<SyncedClockifyTimeEntry, string>({
    id: 'clockify-time-entries',
    storageKey: clockifyEntrySyncStorageKey,
    getKey: entry => entry.id,
  }),
)

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

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
  }, [userQuery.data, workspacesQuery.data])
  const userId = userQuery.data?.id
  const workspaceId = selectedWorkspace?.id
  const syncEnabled = Boolean(clockifyAuthenticated && userId && workspaceId)
  const syncQuery = useQuery({
    queryKey: queryKeys.clockify.entrySync({
      params: { userId, workspaceId },
    }),
    queryFn: () => syncClockifyEntries({ userId: userId!, workspaceId: workspaceId! }),
    enabled: syncEnabled,
    refetchInterval: getClockifyEntrySyncIntervalMilliseconds(clockifyEntrySyncInterval),
    staleTime: 60_000,
  })
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
  await clockifyTimeEntriesCollection.preload()
  const entryIds = clockifyTimeEntriesCollection.toArray.map(syncedEntry => syncedEntry.id)

  if (!entryIds.length) {
    return 0
  }

  const transaction = clockifyTimeEntriesCollection.delete(entryIds)
  await transaction.isPersisted.promise
  return entryIds.length
}

async function syncClockifyEntries({
  userId,
  workspaceId,
}: ClockifyEntrySyncOptions): Promise<ClockifyEntrySyncResult> {
  const now = new Date()
  const syncDays = await storage.get('clockifyEntrySyncDays')
  const start = getClockifyEntrySyncStart(syncDays, now).toISOString()
  const syncedAt = new Date().toISOString()
  const refCounts = {
    github: 0,
    linear: 0,
  }
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
  await clockifyTimeEntriesCollection.preload()
  clockifySyncLog('entry sync collection preloaded', {
    storageKey: clockifyEntrySyncStorageKey,
  })

  try {
    while (true) {
      const entries = await clockify.getTimeEntries({
        params: { workspaceId, userId },
        queries: {
          hydrated: true,
          page,
          'page-size': clockifyEntrySyncPageSize,
          start,
        },
      })
      const pageRefCounts = getClockifyEntryRefCounts(entries)

      pagesFetched += 1
      entriesFetched += entries.length
      refCounts.github += pageRefCounts.github
      refCounts.linear += pageRefCounts.linear

      clockifySyncLog('entry sync page fetched', {
        entriesFetched: entries.length,
        page,
        refCounts: pageRefCounts,
        sample: entries.slice(0, 5).map(getClockifyEntrySyncLog),
      })

      const upsertResult = await upsertSyncedClockifyEntries({ entries, syncedAt, userId, workspaceId })
      entriesInserted += upsertResult.inserted
      entriesStored += upsertResult.stored
      entriesUpdated += upsertResult.updated
      skippedEntries += upsertResult.skipped

      clockifySyncLog('entry sync page stored', {
        page,
        ...upsertResult,
      })

      if (entries.length < clockifyEntrySyncPageSize) {
        break
      }

      page += 1
    }

    const result = {
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

async function upsertSyncedClockifyEntries({
  entries,
  syncedAt,
  userId,
  workspaceId,
}: {
  entries: TimeEntryWithRatesDtoV1[]
  syncedAt: string
  userId: string
  workspaceId: string
}) {
  let inserted = 0
  let stored = 0
  let skipped = 0
  let updated = 0

  for (const entry of entries) {
    if (!entry.id) {
      skipped += 1
      continue
    }

    const syncedEntry = {
      entry,
      id: entry.id,
      startedAt: entry.timeInterval?.start ?? '',
      syncedAt,
      userId: entry.userId ?? userId,
      workspaceId: entry.workspaceId ?? workspaceId,
    } satisfies SyncedClockifyTimeEntry
    const hasEntry = clockifyTimeEntriesCollection.has(syncedEntry.id)
    const transaction = hasEntry
      ? clockifyTimeEntriesCollection.update(syncedEntry.id, draft => {
          Object.assign(draft, syncedEntry)
        })
      : clockifyTimeEntriesCollection.insert(syncedEntry)

    await transaction.isPersisted.promise
    stored += 1

    if (hasEntry) {
      updated += 1
    } else {
      inserted += 1
    }
  }

  return { inserted, skipped, stored, updated }
}

function getClockifyEntrySyncStart(days: ClockifyEntrySyncDaysOption, now: Date) {
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
