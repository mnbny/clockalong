import { db } from '../db'
import { clockifyEntryCache, type ClockifyScope } from './entry-cache'
import { clockifyEntriesInRange } from './entry-queries'
import { fixClockifyTimeEntryOverlaps, getCompletedClockifyTimeEntryOverlapFixes } from './overlaps'
import { getClockifyMonthRange } from './ranges'
import { refreshClockifyEntriesAfterChanges } from './sync'

let activeRepair: { key: string; promise: ReturnType<typeof repairClockifyMonthOverlaps> } | undefined

export function fixClockifyMonthOverlaps(scope: ClockifyScope, timeZone?: string) {
  const key = JSON.stringify([scope.userId, scope.workspaceId, timeZone, clockifyEntryCache.getLifecycle()])
  if (activeRepair) {
    if (activeRepair.key === key) return activeRepair.promise
    return Promise.reject(new Error('Another Clockify overlap repair is still in progress.'))
  }
  const promise = repairClockifyMonthOverlaps(scope, timeZone).finally(() => {
    activeRepair = undefined
  })
  activeRepair = { key, promise }
  return promise
}

async function repairClockifyMonthOverlaps(scope: ClockifyScope, timeZone?: string) {
  const lifecycle = clockifyEntryCache.getLifecycle()
  const range = getClockifyMonthRange(new Date(), timeZone)
  const rows = await clockifyEntriesInRange(db, scope, range.start.toISOString(), range.end.toISOString())
  if (lifecycle !== clockifyEntryCache.getLifecycle()) {
    throw new Error('Clockify account changed before repairing overlaps.')
  }
  const fixes = getCompletedClockifyTimeEntryOverlapFixes(rows.map(row => row.entry))
  const result = { updatedCount: 0, refreshFailed: false }
  if (!fixes.length) return result

  try {
    result.updatedCount = await fixClockifyTimeEntryOverlaps(fixes, async () => {
      if (lifecycle !== clockifyEntryCache.getLifecycle()) {
        throw new Error('Clockify account changed during overlap repair.')
      }
    })
  } finally {
    if (lifecycle === clockifyEntryCache.getLifecycle()) {
      result.refreshFailed = await refreshClockifyEntriesAfterChanges(scope, range.start)
    } else {
      result.refreshFailed = true
    }
  }

  return result
}
