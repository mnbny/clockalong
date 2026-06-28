import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

type CompletedTimeEntryRange = {
  end: number
  entry: TimeEntryWithRatesDtoV1
  start: number
}

export type ClockifyTimeEntryOverlapFix = {
  end: Date
  entry: TimeEntryWithRatesDtoV1
  start: Date
}

export function hasCompletedClockifyTimeEntryOverlap(entries: TimeEntryWithRatesDtoV1[]) {
  const ranges = entries
    .map(getCompletedTimeEntryRange)
    .filter((range): range is CompletedTimeEntryRange => Boolean(range))
    .sort((left, right) => left.start - right.start)

  let latestEnd = 0

  for (const range of ranges) {
    if (range.start < latestEnd) {
      return true
    }

    latestEnd = Math.max(latestEnd, range.end)
  }

  return false
}

export function getCompletedClockifyTimeEntryOverlapFixes(entries: TimeEntryWithRatesDtoV1[]) {
  const ranges = entries
    .map(getCompletedTimeEntryRange)
    .filter((range): range is CompletedTimeEntryRange => Boolean(range))
    .sort((left, right) => left.start - right.start)

  const fixes: ClockifyTimeEntryOverlapFix[] = []
  let latestEnd = 0

  for (const range of ranges) {
    const duration = range.end - range.start
    let start = range.start
    let end = range.end

    if (start < latestEnd) {
      start = latestEnd
      end = start + duration
      fixes.push({ end: new Date(end), entry: range.entry, start: new Date(start) })
    }

    latestEnd = Math.max(latestEnd, end)
  }

  return fixes
}

function getCompletedTimeEntryRange(entry: TimeEntryWithRatesDtoV1): CompletedTimeEntryRange | null {
  const start = parseTime(entry.timeInterval?.start)
  const end = parseTime(entry.timeInterval?.end)

  if (start === null || end === null || end <= start) {
    return null
  }

  return { end, entry, start }
}

function parseTime(value: string | undefined) {
  if (!value) {
    return null
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}
