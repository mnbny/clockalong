import type { StoredClockifyTimeEntry } from './entry-cache'

export const defaultClockifyCollapseOptions = { thresholdMinutes: 5, chunkMinutes: 60, excludeInvoiced: true }
export type ClockifyCollapseOptions = typeof defaultClockifyCollapseOptions

export function getClockifyCollapseGroups(entries: StoredClockifyTimeEntry[], options: ClockifyCollapseOptions) {
  if (
    !Number.isFinite(options.thresholdMinutes) ||
    options.thresholdMinutes <= 0 ||
    !Number.isFinite(options.chunkMinutes) ||
    options.chunkMinutes <= 0
  )
    return []
  const matching = new Map<string, Array<{ entry: StoredClockifyTimeEntry; start: number; duration: number }>>()
  for (const entry of entries) {
    const start = Date.parse(entry.timeInterval?.start ?? '')
    const end = Date.parse(entry.timeInterval?.end ?? '')
    const duration = end - start
    if (
      !entry.id ||
      !entry.userId ||
      !entry.workspaceId ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      duration < 0 ||
      duration > options.thresholdMinutes * 60_000 ||
      (entry.type && entry.type !== 'REGULAR' && entry.type !== 'BREAK') ||
      (options.excludeInvoiced && entry.invoiced !== false)
    )
      continue
    const key = clockifyCollapseEntryKey(entry)
    const group = matching.get(key) ?? []
    group.push({ entry, start, duration })
    matching.set(key, group)
  }
  const groups: Array<{ entries: StoredClockifyTimeEntry[]; start: string; end: string }> = []
  for (const entries of matching.values()) {
    entries.sort((a, b) => a.start - b.start || a.entry.id!.localeCompare(b.entry.id!))
    for (let first = 0; first < entries.length; ) {
      const windowEnd = entries[first].start + options.chunkMinutes * 60_000
      let next = first + 1
      while (next < entries.length && entries[next].start < windowEnd) next++
      if (next - first >= 2) {
        const grouped = entries.slice(first, next)
        const start = entries[first].start
        groups.push({
          entries: grouped.map(row => row.entry),
          start: new Date(start).toISOString(),
          end: new Date(start + grouped.reduce((sum, row) => sum + row.duration, 0)).toISOString(),
        })
      }
      first = next
    }
  }
  return groups.sort((a, b) => a.start.localeCompare(b.start))
}

export function clockifyCollapseEntryKey(entry: StoredClockifyTimeEntry) {
  return JSON.stringify([
    entry.userId,
    entry.workspaceId,
    entry.projectId ?? null,
    entry.taskId ?? null,
    entry.description ?? '',
    entry.billable ?? false,
    entry.type ?? 'REGULAR',
    [...new Set(entry.tagIds ?? [])].sort(),
    canonicalValue(entry.hourlyRate ?? null),
    canonicalValue(entry.costRate ?? null),
    [...(entry.customFieldValues ?? [])]
      .map(field => ({
        customFieldId: field.customFieldId,
        value: canonicalValue(field.value),
      }))
      .sort((a, b) => (a.customFieldId ?? '').localeCompare(b.customFieldId ?? '')),
  ])
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}
