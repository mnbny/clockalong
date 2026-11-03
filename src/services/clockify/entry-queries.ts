import type { DB } from '../db'
import type { ClockifyScope } from './entry-cache'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

import Dexie from 'dexie'

import { normalizeInternalRef } from '../../utils/templates'
import { getClockifyTimeEntryTitle } from './time-entries'
import {
  addClockifyEntrySummary,
  type ClockifyWorkItemTimeSummaries,
  createClockifyEntryMatcher,
} from './work-item-summaries'

export function clockifyEntriesInRange(database: DB, scope: ClockifyScope, start: string, end: string) {
  return database.clockifyEntries
    .where('[userId+workspaceId+startedAt+id]')
    .between(
      [scope.userId, scope.workspaceId, start, Dexie.minKey],
      [scope.userId, scope.workspaceId, end, Dexie.minKey],
      true,
      false,
    )
    .toArray()
}

export async function recentClockifyEntries(
  database: DB,
  scope: ClockifyScope,
  runningId: string | undefined,
  limit: number,
) {
  const titles = new Set<string>()
  const collection = database.clockifyEntries
    .where('[userId+workspaceId+startedAt+id]')
    .between(
      [scope.userId, scope.workspaceId, Dexie.minKey, Dexie.minKey],
      [scope.userId, scope.workspaceId, Dexie.maxKey],
    )
    .reverse()
  return collection
    .filter(row => {
      if (row.id === runningId || !row.entry.timeInterval?.end) return false
      const title = getClockifyTimeEntryTitle(row.entry).trim()
      if (titles.has(title)) return false
      titles.add(title)
      return true
    })
    .limit(limit)
    .toArray()
}

export async function queryClockifySummaries<T>(
  database: DB,
  scope: ClockifyScope,
  workItems: T[],
  getId: (item: T) => string,
  getRef: (item: T) => string,
  runningEntries: TimeEntryWithRatesDtoV1[],
  now = new Date(),
  deadlineAt = Infinity,
  signal?: AbortSignal,
  resolveOwners?: (entries: TimeEntryWithRatesDtoV1[]) => Promise<Map<string, string>>,
) {
  const summaries: ClockifyWorkItemTimeSummaries = {}
  const matchEntry = createClockifyEntryMatcher(workItems, getRef)
  const findOwners =
    resolveOwners ??
    (async entries =>
      new Map(
        entries.flatMap(entry => {
          const item = matchEntry(entry)
          return entry.id && item ? [[entry.id, getId(item)] as const] : []
        }),
      ))
  const runningById = new Map(runningEntries.flatMap(entry => (entry.id ? [[entry.id, entry] as const] : [])))
  const runningRows = await database.clockifyEntries.bulkGet(
    [...runningById.keys()].map(id => [scope.userId, scope.workspaceId, id]),
  )
  const runningOwners = await findOwners([...runningById.values()])
  const running = [...runningById.values()].map((entry, index) => ({
    entry,
    row: runningRows[index],
    owner: runningOwners.get(entry.id!),
  }))
  for (const item of workItems) {
    const ref = normalizeInternalRef(getRef(item))
    const itemId = getId(item)
    const pending = running
      .filter(value => value.owner === itemId)
      .sort((a, b) =>
        !a.row
          ? b.row
            ? 1
            : 0
          : !b.row
            ? -1
            : a.row.startedAt.localeCompare(b.row.startedAt) || a.row.id.localeCompare(b.row.id),
      )
    const addRunning = () => {
      const value = pending.shift()!
      summaries[itemId] = addClockifyEntrySummary(summaries[itemId], value.entry, now)
    }
    let cursor: [string, string] | undefined
    while (true) {
      if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
      const lower = [scope.userId, scope.workspaceId, ref, cursor?.[0] ?? Dexie.minKey, cursor?.[1] ?? Dexie.minKey]
      const upper = [scope.userId, scope.workspaceId, ref, Dexie.maxKey]
      const batch = await database.clockifyEntryRefs
        .where('[userId+workspaceId+refKey+startedAt+entryId]')
        .between(lower, upper, !cursor, true)
        .limit(250)
        .toArray()
      if (!batch.length) break
      const entries = await database.clockifyEntries.bulkGet(
        batch.map(row => [scope.userId, scope.workspaceId, row.entryId]),
      )
      const owners = await findOwners(entries.flatMap(row => (row ? [row.entry] : [])))
      for (const row of entries) {
        if (!row) continue
        while (
          pending[0]?.row &&
          (pending[0].row.startedAt < row.startedAt ||
            (pending[0].row.startedAt === row.startedAt && pending[0].row.id <= row.id))
        )
          addRunning()
        const end = row.entry.timeInterval?.end
        if (runningById.has(row.id) || !end || !Number.isFinite(Date.parse(end))) continue
        if (owners.get(row.id) === itemId)
          summaries[itemId] = addClockifyEntrySummary(summaries[itemId], row.entry, now)
      }
      const last = batch[batch.length - 1]
      cursor = [last.startedAt, last.entryId]
    }
    while (pending.length) addRunning()
  }
  return summaries
}
