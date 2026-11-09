import type { ClockifyScope } from '../clockify/entry-cache'
import type { TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
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

export function queryLinearSummaries(
  database: DB,
  viewerId: string,
  scope: ClockifyScope,
  tickets: LinearTicket[],
  running: TimeEntryWithRatesDtoV1[],
  now: Date,
  deadlineAt = Infinity,
  signal?: AbortSignal,
) {
  return queryClockifySummaries(
    database,
    scope,
    tickets,
    item => item.id,
    getLinearTicketInternalRef,
    running,
    now,
    deadlineAt,
    signal,
    entries => {
      checkDeadline(deadlineAt, signal)
      return resolveLinearEntryOwners(database, viewerId, entries)
    },
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

export async function queryLinearTickets(database: DB, options: TicketQueryOptions) {
  const { viewerId, clockifyScope, runningEntries, sortOrder, showAll, now, deadlineAt, signal } = options
  const tickets = await database.transaction(
    'r',
    database.linearTickets,
    database.linearCacheMeta,
    database.clockifyCacheMeta,
    async () => {
      checkDeadline(deadlineAt, signal)
      // Track summary changes without holding a transaction open across async owner resolution.
      await database.linearCacheMeta.get('state')
      await database.clockifyCacheMeta.get('revision')
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
        rows.push(
          ...batch.map(row => toLinearTicket(row.ticket)).filter(ticket => showAll || !isLinearTicketTerminal(ticket)),
        )
        const last = batch[batch.length - 1]
        after = [last.sequence, last.id]
      }
      return rows
    },
  )
  const activeId = runningEntries[0]?.id
    ? (await resolveLinearEntryOwners(database, viewerId, [runningEntries[0]])).get(runningEntries[0].id)
    : undefined
  const summaries = clockifyScope
    ? await queryLinearSummaries(database, viewerId, clockifyScope, tickets, runningEntries, now, deadlineAt, signal)
    : {}
  checkDeadline(deadlineAt, signal)
  const rows: LinearTicket[] = tickets.map(ticket => ({ ...ticket, ...summaries[ticket.id] }))
  rows.sort((a, b) => compareLinearTickets(a, b, { sortOrder, activeLinearIssueId: activeId }, now.getTime()))
  return { rows, activeId }
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
