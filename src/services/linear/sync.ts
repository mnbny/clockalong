import type { PropsWithChildren } from 'react'

import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import { useStorage } from '../storage/useStorage'
import {
  getLinearTicketSyncIntervalMilliseconds,
  type LinearTicketSortByOption,
  linearTicketsPageSize,
  normalizeLinearTicketSyncLimit,
} from './ticket-settings'
import { type AssignedIssueNode, requestAssignedIssuesPage } from './tickets'

const linearTicketSyncStorageKey = 'clinear.linear.tickets.v1'

export type SyncedLinearTicket = {
  id: string
  syncedAt: string
  ticket: AssignedIssueNode
  updatedAt: string
  viewerId: string
}

type LinearTicketSyncOptions = {
  syncLimit: number
  sortBy: LinearTicketSortByOption
}

type LinearTicketSyncResult = {
  pagesFetched: number
  syncLimit: number
  ticketsDeleted: number
  ticketsFetched: number
  ticketsStored: number
  viewerId: string | null
}

export const linearTicketsCollection = createCollection(
  localStorageCollectionOptions<SyncedLinearTicket, string>({
    id: 'linear-tickets',
    storageKey: linearTicketSyncStorageKey,
    getKey: ticket => ticket.id,
  }),
)

function useLinearSyncData() {
  const authState = useAppAuth()
  const [linearTicketSyncLimit] = useStorage('linearTicketSyncLimit')
  const [linearTicketSyncInterval] = useStorage('linearTicketSyncInterval')
  const [linearTicketSortBy] = useStorage('linearTicketSortBy')
  const normalizedSyncLimit = normalizeLinearTicketSyncLimit(linearTicketSyncLimit)
  const linearAuthenticated = authState.value.linearAuthenticated && !authState.loading
  const syncQuery = useQuery({
    queryKey: queryKeys.linear.ticketSync({
      params: { sortBy: linearTicketSortBy, syncLimit: normalizedSyncLimit },
    }),
    queryFn: () => syncLinearTickets({ sortBy: linearTicketSortBy, syncLimit: normalizedSyncLimit }),
    enabled: linearAuthenticated,
    refetchInterval: getLinearTicketSyncIntervalMilliseconds(linearTicketSyncInterval),
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

async function syncLinearTickets({ sortBy, syncLimit }: LinearTicketSyncOptions): Promise<LinearTicketSyncResult> {
  const syncedAt = new Date().toISOString()
  const fetchedTicketIds = new Set<string>()
  let after: string | null = null
  let pagesFetched = 0
  let ticketsFetched = 0
  let ticketsStored = 0
  let viewerId: string | null = null

  await linearTicketsCollection.preload()

  while (ticketsFetched < syncLimit) {
    const response = await requestAssignedIssuesPage({
      after,
      first: Math.min(linearTicketsPageSize, syncLimit - ticketsFetched),
      orderBy: sortBy,
    })
    const responseViewerId = response.data?.viewer.id ?? null
    const page = response.data?.viewer.assignedIssues

    viewerId = viewerId ?? responseViewerId
    pagesFetched += 1

    if (!page || !responseViewerId) {
      break
    }

    for (const ticket of page.nodes) {
      fetchedTicketIds.add(ticket.id)
    }

    const upsertResult = await upsertSyncedLinearTickets({
      syncedAt,
      tickets: page.nodes,
      viewerId: responseViewerId,
    })
    ticketsFetched += page.nodes.length
    ticketsStored += upsertResult.stored

    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor || page.nodes.length === 0) {
      break
    }

    after = page.pageInfo.endCursor
  }

  const ticketsDeleted = viewerId ? await deleteStaleSyncedLinearTickets({ fetchedTicketIds, viewerId }) : 0

  return {
    pagesFetched,
    syncLimit,
    ticketsDeleted,
    ticketsFetched,
    ticketsStored,
    viewerId,
  }
}

async function upsertSyncedLinearTickets({
  syncedAt,
  tickets,
  viewerId,
}: {
  syncedAt: string
  tickets: AssignedIssueNode[]
  viewerId: string
}) {
  let stored = 0

  for (const ticket of tickets) {
    const syncedTicket = {
      id: ticket.id,
      syncedAt,
      ticket,
      updatedAt: ticket.updatedAt,
      viewerId,
    } satisfies SyncedLinearTicket
    const transaction = linearTicketsCollection.has(syncedTicket.id)
      ? linearTicketsCollection.update(syncedTicket.id, draft => {
          Object.assign(draft, syncedTicket)
        })
      : linearTicketsCollection.insert(syncedTicket)

    await transaction.isPersisted.promise
    stored += 1
  }

  return { stored }
}

async function deleteStaleSyncedLinearTickets({
  fetchedTicketIds,
  viewerId,
}: {
  fetchedTicketIds: Set<string>
  viewerId: string
}) {
  const staleIds = linearTicketsCollection.toArray
    .filter(syncedTicket => syncedTicket.viewerId === viewerId && !fetchedTicketIds.has(syncedTicket.id))
    .map(syncedTicket => syncedTicket.id)

  if (!staleIds.length) {
    return 0
  }

  const transaction = linearTicketsCollection.delete(staleIds)
  await transaction.isPersisted.promise
  return staleIds.length
}
