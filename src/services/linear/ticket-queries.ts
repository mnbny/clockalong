import type { ClockifyScope } from '../clockify/entry-cache'
import type { TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
import type { ClockifyWorkItemTimeSummaries } from '../clockify/work-item-summaries'
import type { DB } from '../db'
import type { LinearTicketSortOrderOption } from './ticket-settings'
import type { LinearTicket } from './tickets'

import Dexie from 'dexie'

import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { queryClockifySummaries } from '../clockify/entry-queries'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'
import { toLinearTicket } from './tickets'
import { compareLinearTickets, isLinearTicketTerminal } from './tickets-sorting'

export type LinearPageCursor = { ticket: LinearTicket; linearRevision: number; clockifyRevision: number }
export type LinearPage = {
  rows: LinearTicket[]
  hasMore: boolean
  reset: boolean
  activeId?: string
  cursor?: LinearPageCursor
  linearRevision?: number
  clockifyRevision?: number
}
type PageOptions = {
  viewerId: string
  clockifyScope: ClockifyScope | null
  runningEntries: TimeEntryWithRatesDtoV1[]
  sortOrder: LinearTicketSortOrderOption
  showAll: boolean
  now: Date
  limit: number
  cursor?: LinearPageCursor
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
  const values = entries.map(entry => ({
    id: entry.id,
    refs: parseInternalRefs(entry.description)
      .filter(ref => ref.provider === 'linear')
      .map(ref => normalizeInternalRef(formatInternalRef(ref))),
  }))
  const refs = [...new Set(values.flatMap(value => value.refs))]
  const matches = refs.length
    ? await database.linearTickets
        .where('[viewerId+refKey]')
        .anyOf(refs.map(ref => [viewerId, ref]))
        .toArray()
    : []
  const byRef = new Map(matches.map(row => [row.refKey, row.id]))
  return new Map(
    values.flatMap(value => {
      const owner = value.refs.map(ref => byRef.get(ref)).find(Boolean)
      return value.id && owner ? [[value.id, owner] as const] : []
    }),
  )
}

function withSummary(ticket: LinearTicket, summaries: ClockifyWorkItemTimeSummaries) {
  return { ...ticket, ...summaries[ticket.id] }
}

export async function queryLinearPage(database: DB, options: PageOptions): Promise<LinearPage> {
  const { viewerId, clockifyScope, runningEntries, sortOrder, showAll, now, limit, deadlineAt, signal } = options
  return database.transaction(
    'r',
    database.linearTickets,
    database.linearCacheMeta,
    database.clockifyEntries,
    database.clockifyEntryRefs,
    database.clockifyCacheMeta,
    async () => {
      const linearRevision = (await database.linearCacheMeta.get('state'))?.revision ?? 0
      const clockifyRevision = (await database.clockifyCacheMeta.get('revision'))?.revision ?? 0
      const reset =
        !!options.cursor &&
        (options.cursor.linearRevision !== linearRevision || options.cursor.clockifyRevision !== clockifyRevision)
      const cursor = reset ? undefined : options.cursor
      const active = runningEntries[0]?.id
        ? (await Dexie.waitFor(resolveLinearEntryOwners(database, viewerId, [runningEntries[0]]))).get(
            runningEntries[0].id,
          )
        : undefined
      const compare = (a: LinearTicket, b: LinearTicket) =>
        compareLinearTickets(a, b, { sortOrder, activeLinearIssueId: active }, now.getTime())
      const selected: LinearTicket[] = []
      const dateField = sortOrder === 'created' ? 'createdAtMs' : sortOrder === 'updated' ? 'updatedAtMs' : null
      const indexName = `[viewerId+${dateField}+id]`
      let position: [number, string] | undefined
      let done = false
      while (dateField && !done) {
        checkDeadline(deadlineAt, signal)
        const cursorDate = cursor
          ? Date.parse(dateField === 'createdAtMs' ? cursor.ticket.createdAt : cursor.ticket.updatedAt)
          : NaN
        const upper = position
          ? [viewerId, position[0], position[1]]
          : cursor
            ? [viewerId, Number.isFinite(cursorDate) ? cursorDate : 0, Dexie.maxKey]
            : [viewerId, Dexie.maxKey]
        const lower = [viewerId, Dexie.minKey, Dexie.minKey]
        const collection = database.linearTickets.where(indexName).between(lower, upper, true, !position)
        const batch = await collection.reverse().limit(128).toArray()
        if (!batch.length) break
        const candidates = batch
          .map(row => toLinearTicket(row.ticket))
          .filter(ticket => showAll || !isLinearTicketTerminal(ticket))
        for (const ticket of candidates) {
          if (cursor && compare(ticket, cursor.ticket) <= 0) continue
          selected.push(ticket)
          selected.sort(compare)
          if (selected.length > limit + 1) selected.pop()
        }
        const last = batch[batch.length - 1]
        position = [last[dateField], last.id]
        if (selected.length > limit) {
          const worst = selected[selected.length - 1]
          const parsed = Date.parse(dateField === 'createdAtMs' ? worst.createdAt : worst.updatedAt)
          const worstDate = Number.isFinite(parsed) ? parsed : 0
          if (position[0] < worstDate) done = true
        }
      }
      if (!dateField) {
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
          const summaries =
            sortOrder === 'custom' && clockifyScope
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
          for (const ticket of candidates) {
            const candidate = withSummary(ticket, summaries)
            if (cursor && compare(candidate, cursor.ticket) <= 0) continue
            selected.push(candidate)
            selected.sort(compare)
            if (selected.length > limit + 1) selected.pop()
          }
          const last = batch[batch.length - 1]
          after = [last.sequence, last.id]
        }
      }
      const rows = selected.slice(0, limit)
      if (sortOrder !== 'custom' && clockifyScope) {
        const summaries = await queryLinearSummaries(
          database,
          viewerId,
          clockifyScope,
          rows,
          runningEntries,
          now,
          deadlineAt,
          signal,
        )
        rows.forEach((row, index) => {
          rows[index] = withSummary(row, summaries)
        })
      }
      const last = rows[rows.length - 1]
      return {
        rows,
        hasMore: selected.length > limit,
        reset,
        linearRevision,
        clockifyRevision,
        activeId: active,
        cursor: last ? { ticket: last, linearRevision, clockifyRevision } : undefined,
      }
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
  const result: LinearTicket[] = []
  let after: [number, string] | undefined
  const text = search?.toLowerCase()
  while (result.length <= limit) {
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
    for (const row of batch) {
      const ticket = toLinearTicket(row.ticket)
      if (!includeClosed && isLinearTicketTerminal(ticket)) continue
      if (text && ![ticket.title, ticket.identifier].some(value => value.toLowerCase().includes(text))) continue
      result.push(ticket)
      if (result.length > limit) break
    }
    const last = batch[batch.length - 1]
    after = [last.sequence, last.id]
  }
  return result
}
