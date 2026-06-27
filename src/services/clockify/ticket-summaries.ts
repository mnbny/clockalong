import type { ClockifyLinearEntryLinkRegistry } from '../storage/config'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

export type ClockifyTicketTimeSummary = {
  lastTrackedAt: string | null
  totalTrackedSeconds: number
}

export type ClockifyTicketTimeSummaries = Record<string, ClockifyTicketTimeSummary>

export function getClockifyTicketSummaryStart(clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry) {
  const earliestLinkedAt = Object.values(clockifyLinearEntryLinks).reduce<number | null>((earliest, link) => {
    const linkedAt = Date.parse(link.linkedAt)

    if (!Number.isFinite(linkedAt)) {
      return earliest
    }

    return earliest === null ? linkedAt : Math.min(earliest, linkedAt)
  }, null)

  if (earliestLinkedAt === null) {
    return null
  }

  const start = new Date(earliestLinkedAt)
  start.setDate(start.getDate() - 1)
  return start
}

export function summarizeClockifyTicketTimeEntries({
  clockifyLinearEntryLinks,
  entries,
  now = new Date(),
}: {
  clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry
  entries: TimeEntryWithRatesDtoV1[]
  now?: Date
}) {
  const linkedEntryIds = new Set(Object.keys(clockifyLinearEntryLinks))
  const uniqueEntries = new Map<string, TimeEntryWithRatesDtoV1>()

  for (const entry of entries) {
    if (entry.id && linkedEntryIds.has(entry.id)) {
      uniqueEntries.set(entry.id, entry)
    }
  }

  const summaries: ClockifyTicketTimeSummaries = {}

  for (const entry of uniqueEntries.values()) {
    if (!entry.id) {
      continue
    }

    const link = clockifyLinearEntryLinks[entry.id]

    if (!link) {
      continue
    }

    const currentSummary = summaries[link.linearIssueId] ?? {
      lastTrackedAt: null,
      totalTrackedSeconds: 0,
    }
    const lastTrackedAt = getEntryLastTrackedAt(entry, link.linkedAt)

    summaries[link.linearIssueId] = {
      lastTrackedAt: getLatestDateString(currentSummary.lastTrackedAt, lastTrackedAt),
      totalTrackedSeconds: currentSummary.totalTrackedSeconds + getEntryDurationSeconds(entry, now),
    }
  }

  return summaries
}

function getEntryLastTrackedAt(entry: TimeEntryWithRatesDtoV1, fallback: string) {
  return entry.timeInterval?.end ?? entry.timeInterval?.start ?? fallback
}

function getLatestDateString(current: string | null, next: string) {
  if (!current) {
    return next
  }

  return Date.parse(next) > Date.parse(current) ? next : current
}

function getEntryDurationSeconds(entry: TimeEntryWithRatesDtoV1, now: Date) {
  const start = parseDate(entry.timeInterval?.start)
  const end = parseDate(entry.timeInterval?.end) ?? now

  if (!start) {
    return 0
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
