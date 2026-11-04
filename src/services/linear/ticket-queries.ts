import type { ClockifyScope } from '../clockify/entry-cache'
import type { TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
import type { ClockifyWorkItemTimeSummaries } from '../clockify/work-item-summaries'
import type { DB } from '../db'
import type { LinearTicketSortOrderOption } from './ticket-settings'
import type { LinearTicket } from './tickets'

import Dexie from 'dexie'

import { getInternalRefKeys } from '../../utils/templates'
import { queryClockifySummaries } from '../clockify/entry-queries'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'
import { resolveClockifyEntryOwners } from '../clockify/work-item-summaries'
import { toLinearTicket } from './tickets'
import { compareLinearTickets, isLinearTicketTerminal } from './tickets-sorting'

type TicketQueryOptions = {
  viewerId: string
  clockifyScope: ClockifyScope | null
  runningEntries: TimeEntryWithRatesDtoV1[]
  sortOrder: LinearTicketSortOrderOption
  showAll: boolean
  now: Date
  deadlineAt?: number
  signal?: AbortSignal
}
function checkDeadline(deadlineAt = Infinity, signal?: AbortSignal) {
  if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('Linear query timed out or cancelled')
}

export async function queryLinearSummaries(
  database: DB,
  viewerId: string,
  scope: ClockifyScope,
  tickets: LinearTicket[],
  running: TimeEntryWithRatesDtoV1[],
  now: Date,
  deadlineAt = Infinity,
  signal?: AbortSignal,
) {
  // Async owner resolution can otherwise let the read transaction commit during a live query.
  return Dexie.waitFor(
    queryClockifySummaries(
      database,
      scope,
      tickets,
      item => item.id,
      getLinearTicketInternalRef,
      running,
      now,
      deadlineAt,
      signal,
      async entries => {
        checkDeadline(deadlineAt, signal)
        return resolveLinearEntryOwners(database, viewerId, entries)
      },
    ),
  )
}

export async function resolveLinearEntryOwners(database: DB, viewerId: string, entries: TimeEntryWithRatesDtoV1[]) {
  const refs = [...new Set(entries.flatMap(entry => getInternalRefKeys(entry.description, 'linear')))]
  const matches = refs.length
    ? await database.linearTickets
        .where('[viewerId+refKey]')
        .anyOf(refs.map(ref => [viewerId, ref]))
        .toArray()
    : []
  return resolveClockifyEntryOwners(entries, 'linear', new Map(matches.map(row => [row.refKey, row.id])))
}

function withSummary(ticket: LinearTicket, summaries: ClockifyWorkItemTimeSummaries) {
  return { ...ticket, ...summaries[ticket.id] }
}

export async function queryLinearTickets(database: DB, options: TicketQueryOptions) {
  const { viewerId, clockifyScope, runningEntries, sortOrder, showAll, now, deadlineAt, signal } = options
  return database.transaction(
    'r',
    database.linearTickets,
    database.linearCacheMeta,
    database.clockifyEntries,
    database.clockifyEntryRefs,
    database.clockifyCacheMeta,
    async () => {
      checkDeadline(deadlineAt, signal)
      // Track updates across the async summary reads, whose dependencies can escape the live query.
      await database.linearCacheMeta.get('state')
      await database.clockifyCacheMeta.get('revision')
      const activeId = runningEntries[0]?.id
        ? (await Dexie.waitFor(resolveLinearEntryOwners(database, viewerId, [runningEntries[0]]))).get(
            runningEntries[0].id,
          )
        : undefined
      const rows: LinearTicket[] = []
      let after: [number, string] | undefined
      while (true) {
        checkDeadline(deadlineAt, signal)
        const batch = await database.linearTickets
          .where('[viewerId+sequence+id]')
          .between(
            [viewerId, after?.[0] ?? Dexie.minKey, after?.[1] ?? Dexie.minKey],
            [viewerId, Dexie.maxKey],
            !after,
            true,
          )
          .limit(128)
          .toArray()
        if (!batch.length) break
        const candidates = batch
          .map(row => toLinearTicket(row.ticket))
          .filter(ticket => showAll || !isLinearTicketTerminal(ticket))
        const summaries = clockifyScope
          ? await queryLinearSummaries(
              database,
              viewerId,
              clockifyScope,
              candidates,
              runningEntries,
              now,
              deadlineAt,
              signal,
            )
          : {}
        rows.push(...candidates.map(ticket => withSummary(ticket, summaries)))
        const last = batch[batch.length - 1]
        after = [last.sequence, last.id]
      }
      checkDeadline(deadlineAt, signal)
      rows.sort((a, b) => compareLinearTickets(a, b, { sortOrder, activeLinearIssueId: activeId }, now.getTime()))
      return { rows, activeId }
    },
  )
}

export async function queryLinearMcpRows(
  database: DB,
  viewerId: string,
  limit: number,
  includeClosed: boolean,
  search: string | null,
  deadlineAt: number,
  signal?: AbortSignal,
) {
  const text = search?.toLowerCase()
  checkDeadline(deadlineAt, signal)
  const rows = await database.linearTickets
    .where('[viewerId+sequence+id]')
    .between([viewerId, Dexie.minKey, Dexie.minKey], [viewerId, Dexie.maxKey])
    .filter(row => {
      checkDeadline(deadlineAt, signal)
      const ticket = toLinearTicket(row.ticket)
      return (
        (includeClosed || !isLinearTicketTerminal(ticket)) &&
        (!text || [ticket.title, ticket.identifier].some(value => value.toLowerCase().includes(text)))
      )
    })
    .limit(limit + 1)
    .toArray()
  checkDeadline(deadlineAt, signal)
  return rows.map(row => toLinearTicket(row.ticket))
}
