import type { PropsWithChildren } from 'react'

import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useMemo } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import { storage, type ClockifyEntrySyncDaysOption } from '../storage/config'
import { clockify } from './client'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

const clockifyEntrySyncPageSize = 100
const clockifyEntrySyncStorageKey = 'clinear.clockify.timeEntries.v1'

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
  end: string
  entriesFetched: number
  entriesStored: number
  pagesFetched: number
  skippedEntries: number
  start: string
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
    refetchInterval: 5 * 60_000,
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

async function syncClockifyEntries({
  userId,
  workspaceId,
}: ClockifyEntrySyncOptions): Promise<ClockifyEntrySyncResult> {
  const now = new Date()
  const syncDays = await storage.get('clockifyEntrySyncDays')
  const end = now.toISOString()
  const start = getClockifyEntrySyncStart(syncDays, now).toISOString()
  const syncedAt = new Date().toISOString()
  let page = 1
  let entriesFetched = 0
  let entriesStored = 0
  let pagesFetched = 0
  let skippedEntries = 0

  await clockifyTimeEntriesCollection.preload()

  while (true) {
    const entries = await clockify.getTimeEntries({
      params: { workspaceId, userId },
      queries: {
        end,
        hydrated: true,
        page,
        'page-size': clockifyEntrySyncPageSize,
        start,
      },
    })

    pagesFetched += 1
    entriesFetched += entries.length

    const upsertResult = await upsertSyncedClockifyEntries({ entries, syncedAt, userId, workspaceId })
    entriesStored += upsertResult.stored
    skippedEntries += upsertResult.skipped

    if (entries.length < clockifyEntrySyncPageSize) {
      break
    }

    page += 1
  }

  return {
    end,
    entriesFetched,
    entriesStored,
    pagesFetched,
    skippedEntries,
    start,
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
  let stored = 0
  let skipped = 0

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
    const transaction = clockifyTimeEntriesCollection.has(syncedEntry.id)
      ? clockifyTimeEntriesCollection.update(syncedEntry.id, draft => {
          Object.assign(draft, syncedEntry)
        })
      : clockifyTimeEntriesCollection.insert(syncedEntry)

    await transaction.isPersisted.promise
    stored += 1
  }

  return { skipped, stored }
}

function getClockifyEntrySyncStart(days: ClockifyEntrySyncDaysOption, now: Date) {
  const start = new Date(now)
  start.setDate(start.getDate() - days)
  return start
}
