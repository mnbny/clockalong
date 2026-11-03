import type { DB } from '../db'
import type { AssignedIssueNode } from './tickets'

import Dexie, { type Transaction } from 'dexie'

import { normalizeInternalRef } from '../../utils/templates'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'
import { db } from '../db'
import { AssignedIssueNodeSchema, toLinearTicket } from './tickets'

export type StoredLinearTicket = {
  viewerId: string
  id: string
  ticket: AssignedIssueNode
  syncedAt: string
  refKey: string
  sequence: number
  createdAtMs: number
  updatedAtMs: number
}

function dateKey(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}

export function createLinearTicketCache(database: DB) {
  let generation = 0
  let lifecycle = 0
  let suspended = false
  let viewerId: string | null = null
  let activeTransaction: Transaction | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  const invalidate = () => {
    generation++
    lifecycle++
    activeTransaction?.abort()
    viewerId = null
    notify()
  }
  const beginSync = () => {
    if (suspended) throw new Error('Linear account is changing')
    activeTransaction?.abort()
    return ++generation
  }
  const requireCurrent = (token: number) => {
    if (token !== generation) throw new Error('Linear sync superseded')
  }

  function checkViewer(id: string, token: number) {
    requireCurrent(token)
    if (viewerId && viewerId !== id) {
      invalidate()
      throw new Error('Linear viewer changed; reconnect to verify the account')
    }
  }

  async function replace(id: string, tickets: AssignedIssueNode[], token: number, syncedAt: string) {
    checkViewer(id, token)
    let stored = 0
    let transaction: Transaction | null = null
    try {
      await database.transaction('rw', database.linearTickets, database.linearCacheMeta, async () => {
        transaction = activeTransaction = Dexie.currentTransaction
        checkViewer(id, token)
        const previous = await database.linearCacheMeta.get('state')
        let sequence = previous?.sequence ?? 0
        const unique = [...new Map(tickets.map(ticket => [ticket.id, ticket])).values()].map(ticket =>
          AssignedIssueNodeSchema.parse(ticket),
        )
        const existing = await database.linearTickets.bulkGet(unique.map(ticket => [id, ticket.id]))
        await database.linearTickets.bulkPut(
          unique.map((ticket, index) => ({
            id: ticket.id,
            viewerId: id,
            ticket,
            syncedAt,
            sequence: existing[index]?.sequence ?? ++sequence,
            refKey: normalizeInternalRef(getLinearTicketInternalRef(toLinearTicket(ticket))),
            createdAtMs: dateKey(ticket.createdAt),
            updatedAtMs: dateKey(ticket.updatedAt),
          })),
        )
        stored = unique.length
        await database.linearCacheMeta.put({ key: 'state', sequence, revision: (previous?.revision ?? 0) + 1 })
        requireCurrent(token)
      })
    } finally {
      if (activeTransaction === transaction) activeTransaction = null
    }
    requireCurrent(token)
    viewerId = id
    notify()
    return stored
  }

  async function clear() {
    invalidate()
    return database.transaction('rw', database.linearTickets, database.linearCacheMeta, async () => {
      const count = await database.linearTickets.count()
      const previous = await database.linearCacheMeta.get('state')
      await database.linearTickets.clear()
      await database.linearCacheMeta.put({
        key: 'state',
        sequence: previous?.sequence ?? 0,
        revision: (previous?.revision ?? 0) + 1,
      })
      return count
    })
  }

  const suspend = () => {
    suspended = true
    invalidate()
  }
  const resume = () => {
    suspended = false
  }
  return {
    database,
    beginSync,
    checkViewer,
    requireCurrent,
    replace,
    invalidate,
    suspend,
    resume,
    clear,
    getViewer: () => viewerId,
    getLifecycle: () => lifecycle,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const linearTicketCache = createLinearTicketCache(db)
try {
  globalThis.localStorage?.removeItem('clockalong.linear.tickets.v1')
} catch (error) {
  console.warn('[linear tickets] could not remove obsolete localStorage cache', error)
}
