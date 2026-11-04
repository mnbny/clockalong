import type { PropsWithChildren } from 'react'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useSyncExternalStore } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryClient, queryKeys } from '../../lib/query-client'
import { useStorage } from '../storage/useStorage'
import { linearTicketCache } from './ticket-cache'
import {
  getLinearTicketSyncIntervalMilliseconds,
  linearTicketsPageSize,
  type LinearTicketSyncIntervalOption,
  type LinearTicketSyncOrderByOption,
  normalizeLinearTicketSyncLimit,
} from './ticket-settings'
import { type AssignedIssueNode, AssignedIssuesPageSchema, requestAssignedIssuesPage } from './tickets'

type LinearTicketSyncOptions = {
  orderBy: LinearTicketSyncOrderByOption
  syncLimit: number
}

function useLinearSyncData() {
  const authState = useAppAuth()
  const [linearTicketSyncLimit] = useStorage('linearTicketSyncLimit')
  const [linearTicketSyncInterval] = useStorage('linearTicketSyncInterval')
  const [linearTicketSyncOrderBy] = useStorage('linearTicketSyncOrderBy')
  const normalizedSyncLimit = normalizeLinearTicketSyncLimit(linearTicketSyncLimit)
  const linearAuthenticated = authState.value.linearAuthenticated && !authState.loading
  const syncQuery = useQuery(
    linearTicketSyncQueryOptions({
      orderBy: linearTicketSyncOrderBy,
      syncLimit: normalizedSyncLimit,
      enabled: linearAuthenticated,
      interval: linearTicketSyncInterval,
    }),
  )
  const syncNow = useCallback(() => syncQuery.refetch(), [syncQuery])
  const viewerId = useSyncExternalStore(
    linearTicketCache.subscribe,
    linearTicketCache.getViewer,
    linearTicketCache.getViewer,
  )

  return {
    lastSyncResult: syncQuery.data ?? null,
    viewerId,
    syncNow,
    queries: {
      syncQuery,
    },
    syncing: syncQuery.isFetching,
  }
}

export function linearTicketSyncQueryOptions({
  orderBy,
  syncLimit,
  enabled,
  interval,
}: {
  orderBy: LinearTicketSyncOrderByOption
  syncLimit: number
  enabled: boolean
  interval: LinearTicketSyncIntervalOption
}) {
  return queryOptions({
    queryKey: queryKeys.linear.ticketSync({
      params: { orderBy, syncLimit },
    }),
    queryFn: () => syncLinearTickets({ orderBy, syncLimit }),
    enabled,
    refetchInterval: getLinearTicketSyncIntervalMilliseconds(interval),
    staleTime: 60_000,
  })
}

type LinearSyncContext = ReturnType<typeof useLinearSyncData>
const LinearSyncContext = createContext<LinearSyncContext | null>(null)

export function LinearSyncProvider(props: PropsWithChildren) {
  const data = useLinearSyncData()

  return createElement(LinearSyncContext.Provider, { value: data }, props.children)
}

export function useLinearSync() {
  const context = useContext(LinearSyncContext)
  if (!context) throw new Error('useLinearSync must be used within a LinearSyncProvider')
  return context
}

let sessionChanges = 0

export async function withLinearSessionChange<T>(operation: () => Promise<T>) {
  sessionChanges++
  linearTicketCache.suspend()
  queryClient.removeQueries({ queryKey: queryKeys.linear.all })
  try {
    return await operation()
  } finally {
    sessionChanges--
    if (sessionChanges === 0) {
      linearTicketCache.resume()
      void queryClient.invalidateQueries({ queryKey: queryKeys.linear.all })
    }
  }
}

export async function clearSyncedLinearTickets() {
  const count = await linearTicketCache.clear()
  queryClient.removeQueries({ queryKey: queryKeys.linear.all })
  return count
}

export async function syncLinearTickets({ orderBy, syncLimit }: LinearTicketSyncOptions) {
  const generation = linearTicketCache.beginSync()
  const syncedAt = new Date().toISOString()
  const ticketsToSync: AssignedIssueNode[] = []
  let after: string | null = null
  let pagesFetched = 0
  let viewerId: string | null = null
  const cursors = new Set<string>()

  while (ticketsToSync.length < syncLimit) {
    const first = Math.min(linearTicketsPageSize, syncLimit - ticketsToSync.length)
    const response = await requestAssignedIssuesPage({ after, first, orderBy })
    linearTicketCache.requireCurrent(generation)
    if (response.errors?.length || !response.data?.viewer?.id || !response.data.viewer.assignedIssues) {
      throw new Error('Invalid Linear assigned-issues response')
    }
    const responseViewerId = response.data.viewer.id
    const page = response.data.viewer.assignedIssues
    linearTicketCache.checkViewer(responseViewerId, generation)
    if (viewerId && viewerId !== responseViewerId) {
      linearTicketCache.invalidate()
      throw new Error('Linear viewer changed during pagination')
    }
    viewerId = responseViewerId
    pagesFetched++
    const parsed = AssignedIssuesPageSchema.safeParse(page)
    if (!parsed.success || parsed.data.nodes.length > first) {
      throw new Error('Invalid Linear assigned-issues page')
    }
    ticketsToSync.push(...parsed.data.nodes)
    if (!parsed.data.pageInfo.hasNextPage) break
    const cursor = parsed.data.pageInfo.endCursor
    if (!cursor || !parsed.data.nodes.length || cursors.has(cursor)) throw new Error('Invalid Linear pagination cursor')
    cursors.add(cursor)
    after = cursor
  }
  if (!viewerId) throw new Error('Missing Linear viewer')
  const ticketsStored = await linearTicketCache.replace(viewerId, ticketsToSync, generation, syncedAt)
  return { pagesFetched, syncLimit, ticketsDeleted: 0, ticketsFetched: ticketsToSync.length, ticketsStored, viewerId }
}
