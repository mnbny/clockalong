import type { PropsWithChildren } from 'react'

import { createCollection, createTransaction, localStorageCollectionOptions } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import { useStorage } from '../storage/useStorage'
import {
  getLinearTicketSyncIntervalMilliseconds,
  linearTicketsPageSize,
  type LinearTicketSyncOrderByOption,
  normalizeLinearTicketSyncLimit,
} from './ticket-settings'
import { type AssignedIssueNode, requestAssignedIssuesPage } from './tickets'

const linearTicketSyncStorageKey = 'clockalong.linear.tickets.v1'

export type SyncedLinearTicket = {
  id: string
  syncedAt: string
  ticket: AssignedIssueNode
  updatedAt: string
  viewerId: string
}

type LinearTicketSyncOptions = {
  orderBy: LinearTicketSyncOrderByOption
  syncLimit: number
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
  const [linearTicketSyncOrderBy] = useStorage('linearTicketSyncOrderBy')
  const normalizedSyncLimit = normalizeLinearTicketSyncLimit(linearTicketSyncLimit)
  const linearAuthenticated = authState.value.linearAuthenticated && !authState.loading
  const syncQuery = useQuery({
    queryKey: queryKeys.linear.ticketSync({
      params: { orderBy: linearTicketSyncOrderBy, syncLimit: normalizedSyncLimit },
    }),
    queryFn: () => syncLinearTickets({ orderBy: linearTicketSyncOrderBy, syncLimit: normalizedSyncLimit }),
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

export async function clearSyncedLinearTickets() {
  await linearTicketsCollection.preload()
  const ticketIds = linearTicketsCollection.toArray.map(syncedTicket => syncedTicket.id)

  if (!ticketIds.length) {
    return 0
  }

  const transaction = linearTicketsCollection.delete(ticketIds)
  await transaction.isPersisted.promise
  return ticketIds.length
}

async function syncLinearTickets({ orderBy, syncLimit }: LinearTicketSyncOptions): Promise<LinearTicketSyncResult> {
  const syncedAt = new Date().toISOString()
  const fetchedTicketIds = new Set<string>()
  const ticketsToSync: AssignedIssueNode[] = []
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
      orderBy,
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
    ticketsToSync.push(...page.nodes)
    ticketsFetched += page.nodes.length

    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor || page.nodes.length === 0) {
      break
    }

    after = page.pageInfo.endCursor
  }

  let ticketsDeleted = 0

  if (viewerId) {
    const staleTicketIds = linearTicketsCollection.toArray
      .filter(syncedTicket => syncedTicket.viewerId === viewerId && !fetchedTicketIds.has(syncedTicket.id))
      .map(syncedTicket => syncedTicket.id)
    const upsertResult = await upsertSyncedLinearTickets({
      staleTicketIds,
      syncedAt,
      tickets: ticketsToSync,
      viewerId,
    })

    ticketsDeleted = upsertResult.deleted
    ticketsStored = upsertResult.stored
  }

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
  staleTicketIds,
  syncedAt,
  tickets,
  viewerId,
}: {
  staleTicketIds: string[]
  syncedAt: string
  tickets: AssignedIssueNode[]
  viewerId: string
}) {
  const syncedTickets = tickets.map(
    ticket =>
      ({
        id: ticket.id,
        syncedAt,
        ticket,
        updatedAt: ticket.updatedAt,
        viewerId,
      }) satisfies SyncedLinearTicket,
  )
  const ticketsToInsert = syncedTickets.filter(ticket => !linearTicketsCollection.has(ticket.id))
  const ticketsToUpdate = syncedTickets.filter(ticket => linearTicketsCollection.has(ticket.id))

  if (ticketsToInsert.length || ticketsToUpdate.length || staleTicketIds.length) {
    const transaction = createTransaction({
      mutationFn: async ({ transaction: mutations }) => {
        linearTicketsCollection.utils.acceptMutations(mutations)
      },
    })

    transaction.mutate(() => {
      if (ticketsToInsert.length) {
        linearTicketsCollection.insert(ticketsToInsert)
      }

      if (ticketsToUpdate.length) {
        linearTicketsCollection.update(
          ticketsToUpdate.map(ticket => ticket.id),
          drafts => {
            drafts.forEach((draft, index) => Object.assign(draft, ticketsToUpdate[index]))
          },
        )
      }

      if (staleTicketIds.length) {
        linearTicketsCollection.delete(staleTicketIds)
      }
    })
    await transaction.isPersisted.promise
  }

  return {
    deleted: staleTicketIds.length,
    inserted: ticketsToInsert.length,
    stored: syncedTickets.length,
    updated: ticketsToUpdate.length,
  }
}
