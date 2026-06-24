import type { ClockifyLinearEntryLinkRegistry } from '../storage/config'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

import { clockify } from './client'

export type ClockifyTicketTimeSummary = {
  lastTrackedAt: string | null
  totalTrackedSeconds: number
}

export type ClockifyTicketTimeSummaries = Record<string, ClockifyTicketTimeSummary>

export const clockifyTicketTimeSummariesQueryKey = ['clockify', 'ticket-time-summaries'] as const

const clockifyTimeEntriesPageSize = 100

export async function getClockifyTicketTimeSummaries({
  clockifyLinearEntryLinks,
}: {
  clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry
}): Promise<ClockifyTicketTimeSummaries> {
  const entryIds = Object.keys(clockifyLinearEntryLinks)

  if (entryIds.length === 0) {
    return {}
  }

  const start = getClockifySummaryStart(clockifyLinearEntryLinks)

  if (!start) {
    clockifyTicketSummaryLog('skipped', {
      reason: 'no-valid-linked-at',
      linkedEntryCount: entryIds.length,
    })
    return {}
  }

  const [user, workspaces] = await Promise.all([clockify.getLoggedUser(), clockify.getWorkspacesOfUser()])
  const workspaceId = user.activeWorkspace ?? user.defaultWorkspace ?? workspaces[0]?.id

  if (!user.id || !workspaceId) {
    clockifyTicketSummaryLog('skipped', {
      reason: 'missing-user-or-workspace',
      userPresent: Boolean(user.id),
      workspacePresent: Boolean(workspaceId),
    })
    return {}
  }

  const entries = await getLinkedClockifyEntries({
    clockifyLinearEntryLinks,
    end: new Date(),
    start,
    userId: user.id,
    workspaceId,
  })
  const summaries = summarizeEntriesByLinearIssue(entries, clockifyLinearEntryLinks, new Date())

  clockifyTicketSummaryLog('complete', {
    linkedEntryCount: entryIds.length,
    matchedEntryCount: entries.length,
    ticketCount: Object.keys(summaries).length,
  })

  return summaries
}

function getClockifySummaryStart(clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry) {
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

async function getLinkedClockifyEntries({
  clockifyLinearEntryLinks,
  end,
  start,
  userId,
  workspaceId,
}: {
  clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry
  end: Date
  start: Date
  userId: string
  workspaceId: string
}) {
  const linkedEntryIds = new Set(Object.keys(clockifyLinearEntryLinks))
  const entries = new Map<string, TimeEntryWithRatesDtoV1>()
  let page = 1
  let hasNextPage = true

  clockifyTicketSummaryLog('fetch start', {
    linkedEntryCount: linkedEntryIds.size,
    start: start.toISOString(),
  })

  while (hasNextPage) {
    const pageEntries = await clockify.getTimeEntries({
      params: { workspaceId, userId },
      queries: {
        end: end.toISOString(),
        hydrated: true,
        page,
        'page-size': clockifyTimeEntriesPageSize,
        start: start.toISOString(),
      },
    })

    for (const entry of pageEntries) {
      if (entry.id && linkedEntryIds.has(entry.id)) {
        entries.set(entry.id, entry)
      }
    }

    clockifyTicketSummaryLog('fetch page', {
      matchedEntryCount: entries.size,
      page,
      pageEntryCount: pageEntries.length,
    })

    hasNextPage = pageEntries.length === clockifyTimeEntriesPageSize
    page += 1
  }

  const runningEntries = await clockify.getTimeEntries({
    params: { workspaceId, userId },
    queries: {
      hydrated: true,
      'in-progress': 'true',
      page: 1,
      'page-size': 10,
    },
  })

  for (const entry of runningEntries) {
    if (entry.id && linkedEntryIds.has(entry.id)) {
      entries.set(entry.id, entry)
    }
  }

  return [...entries.values()]
}

function summarizeEntriesByLinearIssue(
  entries: TimeEntryWithRatesDtoV1[],
  clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry,
  now: Date,
) {
  const summaries: ClockifyTicketTimeSummaries = {}

  for (const entry of entries) {
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

function clockifyTicketSummaryLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify api] ticket summaries ${message}`)
    return
  }

  console.info(`[clockify api] ticket summaries ${message}`, details)
}
