import { queryClient, queryKeys } from '../../lib/query-client'
import { db } from '../db'
import { clockifyEntryCache, type ClockifyScope } from './entry-cache'
import { clockifyEntriesInRange } from './entry-queries'
import { fixClockifyTimeEntryOverlaps, getCompletedClockifyTimeEntryOverlapFixes } from './overlaps'
import { getClockifyMonthRange } from './ranges'
import { cacheClockifyEntryResult, syncClockifyEntries } from './sync'

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
  const refreshEntries = () => syncClockifyEntries({ ...scope, start: range.start })

  // A pending background retry can supersede the full-month sync and leave its cache stale.
  const pendingSync = queryClient.getQueryCache().find({
    queryKey: queryKeys.clockify.entrySync({ params: scope }),
    exact: true,
  })?.promise
  await pendingSync?.catch(() => {})
  if (lifecycle !== clockifyEntryCache.getLifecycle()) {
    throw new Error('Clockify account changed before repairing overlaps.')
  }
  await refreshEntries()
  const rows = await clockifyEntriesInRange(db, scope, range.start.toISOString(), range.end.toISOString())
  if (lifecycle !== clockifyEntryCache.getLifecycle()) {
    throw new Error('Clockify account changed before repairing overlaps.')
  }
  const fixes = getCompletedClockifyTimeEntryOverlapFixes(rows.map(row => row.entry))
  const result = { updatedCount: 0, refreshFailed: false }
  if (!fixes.length) return result

  try {
    result.updatedCount = await fixClockifyTimeEntryOverlaps(fixes, async (entries, updatedFixes) => {
      if (lifecycle !== clockifyEntryCache.getLifecycle()) {
        throw new Error('Clockify account changed during overlap repair.')
      }
      try {
        for (const fixed of updatedFixes) {
          await cacheClockifyEntryResult(
            entries.find(entry => entry.id === fixed.entry.id)!,
            {
              ...fixed.entry,
              timeInterval: {
                ...fixed.entry.timeInterval,
                start: fixed.start.toISOString(),
                end: fixed.end.toISOString(),
              },
            },
            lifecycle,
          )
        }
      } catch (error) {
        console.warn('[clockify sync] Could not cache repaired entries:', error)
      }
    })
  } finally {
    const refreshed = await Promise.allSettled([
      refreshEntries(),
      queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() }, { throwOnError: true }),
    ])
    for (const refresh of refreshed) {
      if (refresh.status === 'rejected') {
        result.refreshFailed = true
        console.warn('[clockify sync] Could not refresh after repairing overlaps:', refresh.reason)
      }
    }
  }

  return result
}
