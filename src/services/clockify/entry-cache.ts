import type { DB } from '../db'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'
import type { SyncedClockifyTimeEntry } from './sync'

import Dexie from 'dexie'

import { pick } from '../../utils/objects'
import { getInternalRefKeys } from '../../utils/templates'
import { db } from '../db'

export type ClockifyScope = { userId: string; workspaceId: string }
export type StoredClockifyEntry = SyncedClockifyTimeEntry & { revision: number }
export type ClockifyEntryRef = ClockifyScope & { refKey: string; entryId: string; startedAt: string }

const fields = [
  'billable',
  'description',
  'hourlyRate',
  'id',
  'projectId',
  'tagIds',
  'taskId',
  'timeInterval',
  'type',
  'userId',
  'workspaceId',
] as const satisfies ReadonlyArray<keyof TimeEntryWithRatesDtoV1>

export type StoredClockifyTimeEntry = Pick<TimeEntryWithRatesDtoV1, (typeof fields)[number]>

function normalizeStart(start: string | undefined) {
  const time = start ? Date.parse(start) : NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

export function createClockifyEntryCache(database: DB) {
  const { clockifyEntries: entries, clockifyEntryRefs: refs, clockifyCacheMeta: meta } = database
  let generation = 0
  let lifecycle = 0

  function beginSync() {
    return ++generation
  }

  async function getRevision() {
    return (await meta.get('revision'))?.revision ?? 0
  }

  async function bumpRevision() {
    const revision = (await getRevision()) + 1
    await meta.put({ key: 'revision', revision })
    return revision
  }

  function rowFor(
    entry: TimeEntryWithRatesDtoV1,
    scope: ClockifyScope,
    syncedAt: string,
    revision: number,
  ): StoredClockifyEntry | null {
    if (
      !entry.id ||
      (entry.userId && entry.userId !== scope.userId) ||
      (entry.workspaceId && entry.workspaceId !== scope.workspaceId)
    )
      return null
    return {
      entry: pick(entry, ...fields),
      id: entry.id,
      startedAt: normalizeStart(entry.timeInterval?.start),
      syncedAt,
      ...scope,
      revision,
    }
  }

  function referencesFor(row: StoredClockifyEntry) {
    const { userId, workspaceId, id: entryId, startedAt } = row
    return getInternalRefKeys(row.entry.description).map(refKey => ({
      userId,
      workspaceId,
      entryId,
      startedAt,
      refKey,
    }))
  }

  async function put(row: StoredClockifyEntry) {
    await refs.where('[userId+workspaceId+entryId]').equals([row.userId, row.workspaceId, row.id]).delete()
    await entries.put(row)
    await refs.bulkPut(referencesFor(row))
  }

  async function upsert(
    entry: TimeEntryWithRatesDtoV1,
    scope: ClockifyScope,
    syncedAt = new Date().toISOString(),
    expectedLifecycle = lifecycle,
  ) {
    return database.transaction('rw', entries, refs, meta, async () => {
      if (lifecycle !== expectedLifecycle) return { inserted: 0, updated: 0, stored: 0, skipped: 1, deleted: 0 }
      const revision = await bumpRevision()
      const row = rowFor(entry, scope, syncedAt, revision)
      if (!row) return { inserted: 0, updated: 0, stored: 0, skipped: 1, deleted: 0 }
      const existing = await entries.get([scope.userId, scope.workspaceId, row.id])
      await put(row)
      if (lifecycle !== expectedLifecycle) throw new Error('Clockify account changed during cache write')
      return { inserted: existing ? 0 : 1, updated: existing ? 1 : 0, stored: 1, skipped: 0, deleted: 0 }
    })
  }

  async function reconcile(
    scope: ClockifyScope,
    incoming: TimeEntryWithRatesDtoV1[],
    start: string,
    end: string,
    syncedAt: string,
    syncGeneration: number,
    initialRevision: number,
  ) {
    if (generation !== syncGeneration) throw new Error('Clockify sync superseded')
    return database.transaction('rw', entries, refs, meta, async () => {
      if (generation !== syncGeneration) throw new Error('Clockify sync superseded')
      const revision = await bumpRevision()
      const rows = new Map<string, StoredClockifyEntry>()
      let skipped = 0
      for (const entry of incoming) {
        const row = rowFor(entry, scope, syncedAt, revision)
        if (!row) skipped++
        else rows.set(row.id, row)
      }
      let inserted = 0,
        updated = 0
      const candidates = await entries
        .where('[userId+workspaceId+startedAt+id]')
        .between(
          [scope.userId, scope.workspaceId, start, Dexie.minKey],
          [scope.userId, scope.workspaceId, end, Dexie.maxKey],
          true,
          true,
        )
        .toArray()
      const removed = candidates.filter(row => row.revision <= initialRevision && !rows.has(row.id))
      const incomingRows = [...rows.values()]
      const existing = await entries.bulkGet(incomingRows.map(row => [scope.userId, scope.workspaceId, row.id]))
      const stored = incomingRows.filter((_row, index) => {
        if (existing[index] && existing[index].revision > initialRevision) return false
        if (existing[index]) updated++
        else inserted++
        return true
      })
      const changed = [...removed, ...stored].map(row => [scope.userId, scope.workspaceId, row.id])
      if (changed.length) await refs.where('[userId+workspaceId+entryId]').anyOf(changed).delete()
      await entries.bulkDelete(removed.map(row => [scope.userId, scope.workspaceId, row.id]))
      await entries.bulkPut(stored)
      await refs.bulkPut(stored.flatMap(referencesFor))
      if (generation !== syncGeneration) throw new Error('Clockify sync superseded')
      return { inserted, updated, stored: inserted + updated, skipped, deleted: removed.length }
    })
  }

  async function clear() {
    ++generation
    ++lifecycle
    return database.transaction('rw', entries, refs, meta, async () => {
      const count = await entries.count()
      await entries.clear()
      await refs.clear()
      await bumpRevision()
      return count
    })
  }

  return { beginSync, getRevision, getLifecycle: () => lifecycle, reconcile, upsert, clear, database }
}

export const clockifyEntryCache = createClockifyEntryCache(db)

try {
  globalThis.localStorage?.removeItem('clockalong.clockify.timeEntries.v1')
} catch (error) {
  console.warn('[clockify sync] could not remove obsolete localStorage cache', error)
}
