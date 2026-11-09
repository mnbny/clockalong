import type { ClockifyScope } from './entry-cache'

import axios from 'axios'

import { db } from '../db'
import { storage } from '../storage/config'
import { clockify } from './client'
import { clockifyCollapseEntryKey, getClockifyCollapseGroups } from './collapse'
import { clockifyEntryCache } from './entry-cache'
import { clockifyEntriesInRange } from './entry-queries'
import { getClockifyMonthRange } from './ranges'
import { refreshClockifyEntriesAfterChanges } from './sync'
import { createClockifyTimeEntryFromEntry } from './time-entries'

export type ClockifyCollapseOperation = ClockifyScope & {
  id: string
  start: string
  knownIds: string[]
  groups: Array<
    ReturnType<typeof getClockifyCollapseGroups>[number] & {
      creating: boolean
      createdId?: string
      deletedIds: string[]
    }
  >
}

export function clockifyCollapseOperationId(scope: ClockifyScope) {
  return JSON.stringify([scope.userId, scope.workspaceId])
}

let activeCollapse: { key: string; promise: ReturnType<typeof collapseMonthEntries> } | undefined

export function collapseClockifyMonthEntries(scope: ClockifyScope, timeZone?: string) {
  const key = JSON.stringify([scope.userId, scope.workspaceId, timeZone, clockifyEntryCache.getLifecycle()])
  if (activeCollapse) {
    if (activeCollapse.key === key) return activeCollapse.promise
    return Promise.reject(new Error('Another Clockify collapse is still in progress.'))
  }
  const promise = collapseMonthEntries(scope, timeZone).finally(() => {
    activeCollapse = undefined
  })
  activeCollapse = { key, promise }
  return promise
}

async function collapseMonthEntries(scope: ClockifyScope, timeZone?: string) {
  const lifecycle = clockifyEntryCache.getLifecycle()
  const assertAccount = () => {
    if (lifecycle !== clockifyEntryCache.getLifecycle()) throw new Error('Clockify account changed during collapse.')
  }
  const [thresholdMinutes, chunkMinutes, excludeInvoiced] = await Promise.all([
    storage.get('clockifyCollapseThresholdMinutes'),
    storage.get('clockifyCollapseChunkMinutes'),
    storage.get('clockifyCollapseExcludeInvoiced'),
  ])
  const range = getClockifyMonthRange(new Date(), timeZone)
  const id = clockifyCollapseOperationId(scope)
  let operation = await db.clockifyCollapses.get(id)
  const rows = await clockifyEntriesInRange(
    db,
    scope,
    operation?.start ?? range.start.toISOString(),
    range.end.toISOString(),
  )
  assertAccount()
  if (!operation) {
    const groups = getClockifyCollapseGroups(
      rows.map(row => row.entry),
      { thresholdMinutes, chunkMinutes, excludeInvoiced },
    )
    if (!groups.length) return { createdCount: 0, deletedCount: 0, refreshFailed: false }
    operation = {
      id,
      ...scope,
      start: range.start.toISOString(),
      knownIds: rows.map(row => row.id),
      groups: groups.map(group => ({ ...group, creating: false, deletedIds: [] })),
    }
    await db.clockifyCollapses.add(operation)
  }
  const result = { createdCount: 0, deletedCount: 0, refreshFailed: false }
  let complete = false
  try {
    for (const group of operation.groups) {
      assertAccount()
      if (group.creating && !group.createdId) {
        // A lost create response must be reconciled from a later sync, never blindly retried.
        const candidates = rows.filter(
          row =>
            !operation.knownIds.includes(row.id) &&
            Date.parse(row.entry.timeInterval?.start ?? '') === Date.parse(group.start) &&
            Date.parse(row.entry.timeInterval?.end ?? '') === Date.parse(group.end) &&
            clockifyCollapseEntryKey(row.entry) === clockifyCollapseEntryKey(group.entries[0]),
        )
        if (candidates.length !== 1) {
          throw new Error(
            'A previous replacement could not be confirmed. Sync Clockify and retry collapse after checking its result.',
          )
        }
        group.createdId = candidates[0].id
        group.creating = false
        await db.clockifyCollapses.put(operation)
      }
      const remaining = group.entries.filter(entry => !group.deletedIds.includes(entry.id!))
      if (
        remaining.some(entry => {
          const current = rows.find(row => row.id === entry.id)?.entry
          if (!current) return !group.createdId
          return (
            Date.parse(current.timeInterval?.start ?? '') !== Date.parse(entry.timeInterval?.start ?? '') ||
            Date.parse(current.timeInterval?.end ?? '') !== Date.parse(entry.timeInterval?.end ?? '') ||
            clockifyCollapseEntryKey(current) !== clockifyCollapseEntryKey(entry)
          )
        })
      ) {
        throw new Error(
          'Some original entries are missing or changed in the cache. Sync and review before resuming collapse.',
        )
      }
      if (group.createdId && remaining.length) {
        const replacement = rows.find(row => row.id === group.createdId)?.entry
        if (
          !replacement ||
          Date.parse(replacement.timeInterval?.start ?? '') !== Date.parse(group.start) ||
          Date.parse(replacement.timeInterval?.end ?? '') !== Date.parse(group.end) ||
          clockifyCollapseEntryKey(replacement) !== clockifyCollapseEntryKey(group.entries[0])
        ) {
          throw new Error(
            'The saved replacement is missing or changed in the cache. Sync and review before resuming collapse.',
          )
        }
      }
      if (
        excludeInvoiced &&
        remaining.some(entry => {
          const current = rows.find(row => row.id === entry.id)
          return current ? current.entry.invoiced !== false : !group.createdId
        })
      )
        throw new Error(
          'Some original entries are invoiced or their invoice status is unknown. Sync and review before resuming collapse.',
        )
      if (!group.createdId) {
        group.creating = true
        await db.clockifyCollapses.put(operation)
        assertAccount()
        let replacement
        try {
          replacement = await createClockifyTimeEntryFromEntry(group.entries[0], null, {
            start: group.start,
            end: group.end,
          })
        } catch (error) {
          if (
            axios.isAxiosError(error) &&
            error.response &&
            error.response.status >= 400 &&
            error.response.status < 500 &&
            error.response.status !== 408
          ) {
            group.creating = false
            await db.clockifyCollapses.put(operation)
          }
          throw error
        }
        if (
          !replacement.id ||
          Date.parse(replacement.timeInterval?.start ?? '') !== Date.parse(group.start) ||
          Date.parse(replacement.timeInterval?.end ?? '') !== Date.parse(group.end)
        ) {
          throw new Error('Clockify did not confirm the replacement entry. The originals have not been deleted.')
        }
        group.createdId = replacement.id
        group.creating = false
        await db.clockifyCollapses.put(operation)
      }
      result.createdCount++
      // IDs are query parameters, so keep URLs bounded even for unusually large groups.
      const batchSize = 25
      for (let offset = 0; offset < remaining.length; offset += batchSize) {
        assertAccount()
        const ids = remaining.slice(offset, offset + batchSize).map(entry => entry.id!)
        const deleted = await clockify.deleteMany(undefined, {
          params: scope,
          queries: { 'time-entry-ids': ids },
        })
        const deletedIds = new Set(Array.isArray(deleted) ? deleted.map(entry => entry?.id) : [])
        const confirmed = ids.filter(id => deletedIds.has(id))
        group.deletedIds.push(...confirmed)
        await db.clockifyCollapses.put(operation)
        if (confirmed.length !== ids.length) {
          throw new Error('Clockify did not confirm every deletion. Retry collapse after the cache refresh completes.')
        }
      }
      result.deletedCount += group.deletedIds.length
    }
    complete = true
  } finally {
    result.refreshFailed =
      lifecycle === clockifyEntryCache.getLifecycle()
        ? await refreshClockifyEntriesAfterChanges(scope, new Date(operation.start))
        : true
    if (!complete && !result.refreshFailed) {
      // A failed bulk response can still leave deletions saved. Only a complete sync confirms absences.
      const pending = operation.groups.flatMap(group =>
        group.createdId
          ? group.entries
              .filter(entry => !group.deletedIds.includes(entry.id!))
              .map(entry => ({ group, id: entry.id! }))
          : [],
      )
      const current = await db.clockifyEntries.bulkGet(
        pending.map(entry => [scope.userId, scope.workspaceId, entry.id]),
      )
      assertAccount()
      const removed = pending.filter((_entry, index) => !current[index])
      if (removed.length) {
        for (const { group, id } of removed) group.deletedIds.push(id)
        await db.clockifyCollapses.put(operation)
      }
    }
    if (complete && !result.refreshFailed) await db.clockifyCollapses.delete(id)
  }
  return result
}
