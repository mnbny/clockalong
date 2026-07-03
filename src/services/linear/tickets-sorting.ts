import type { LinearTicketSortOrderOption } from './ticket-settings'
import type { LinearTicket } from './tickets'

export type SortLinearTicketsOptions = {
  activeLinearIssueId?: string | null
  sortOrder: LinearTicketSortOrderOption
}

type RelevanceBucket =
  | 'running'
  | 'recentlyTrackedWorkable'
  | 'started'
  | 'unstarted'
  | 'backlog'
  | 'recentlyTrackedTerminal'
  | 'terminal'

const recentTrackedWindowMs = 7 * 24 * 60 * 60 * 1000

const relevanceBucketRank: Record<RelevanceBucket, number> = {
  running: 0,
  recentlyTrackedWorkable: 1,
  started: 2,
  unstarted: 3,
  backlog: 4,
  recentlyTrackedTerminal: 5,
  terminal: 6,
}

const linearStatusTypeRank: Record<string, number> = {
  started: 0,
  unstarted: 1,
  triage: 2,
  backlog: 3,
  completed: 4,
  canceled: 5,
  duplicate: 6,
}

let previousSortLogSignature: string | null = null

export function sortLinearTickets(tickets: LinearTicket[], options: SortLinearTicketsOptions) {
  const now = Date.now()
  const sortedTickets = [...tickets].sort((firstTicket, secondTicket) => {
    switch (options.sortOrder) {
      case 'alphabetical':
        return compareAlphabetical(firstTicket, secondTicket)
      case 'created':
        return (
          compareDateDesc(firstTicket.createdAt, secondTicket.createdAt) || compareStable(firstTicket, secondTicket)
        )
      case 'custom':
        return compareCustom(firstTicket, secondTicket, options, now)
      case 'status':
        return compareStatus(firstTicket, secondTicket) || compareStable(firstTicket, secondTicket)
      case 'updated':
        return (
          compareDateDesc(firstTicket.updatedAt, secondTicket.updatedAt) || compareStable(firstTicket, secondTicket)
        )
    }
  })

  logSortSummary(sortedTickets, options)

  return sortedTickets
}

function logSortSummary(sortedTickets: LinearTicket[], options: SortLinearTicketsOptions) {
  const activeLinearIssuePresent = sortedTickets.some(ticket => ticket.id === options.activeLinearIssueId)
  const trackedTicketCount = sortedTickets.filter(ticket => ticket.lastTrackedAt || ticket.totalTrackedSeconds).length
  const topIdentifiers = sortedTickets.slice(0, 5).map(ticket => ticket.identifier)
  const signature = JSON.stringify({
    activeLinearIssuePresent,
    count: sortedTickets.length,
    sortOrder: options.sortOrder,
    topIdentifiers,
    trackedTicketCount,
  })

  if (signature === previousSortLogSignature) {
    return
  }

  previousSortLogSignature = signature
  linearTicketsLog('sort complete', {
    activeLinearIssuePresent,
    sortOrder: options.sortOrder,
    topIdentifiers,
    totalTickets: sortedTickets.length,
    trackedTicketCount,
  })
}

function compareCustom(
  firstTicket: LinearTicket,
  secondTicket: LinearTicket,
  options: SortLinearTicketsOptions,
  now: number,
) {
  const firstBucket = getRelevanceBucket(firstTicket, options, now)
  const secondBucket = getRelevanceBucket(secondTicket, options, now)
  const firstBucketRank = relevanceBucketRank[firstBucket]
  const secondBucketRank = relevanceBucketRank[secondBucket]
  const inRecentBucket =
    firstBucket === 'recentlyTrackedWorkable' ||
    firstBucket === 'recentlyTrackedTerminal' ||
    secondBucket === 'recentlyTrackedWorkable' ||
    secondBucket === 'recentlyTrackedTerminal'

  return (
    compareNumberAsc(firstBucketRank, secondBucketRank) ||
    (inRecentBucket ? compareLastTrackedDesc(firstTicket, secondTicket) : 0) ||
    compareStatus(firstTicket, secondTicket) ||
    compareLastTrackedDesc(firstTicket, secondTicket) ||
    compareDateDesc(firstTicket.updatedAt, secondTicket.updatedAt) ||
    compareStable(firstTicket, secondTicket)
  )
}

function getRelevanceBucket(ticket: LinearTicket, options: SortLinearTicketsOptions, now: number): RelevanceBucket {
  if (ticket.id === options.activeLinearIssueId) {
    return 'running'
  }

  const recentlyTracked = isRecentlyTracked(ticket, now)

  switch (ticket.status.type) {
    case 'started':
      return recentlyTracked ? 'recentlyTrackedWorkable' : 'started'
    case 'unstarted':
      return recentlyTracked ? 'recentlyTrackedWorkable' : 'unstarted'
    case 'backlog':
    case 'triage':
      return 'backlog'
    case 'canceled':
    case 'completed':
    case 'duplicate':
      return recentlyTracked ? 'recentlyTrackedTerminal' : 'terminal'
    default:
      return 'terminal'
  }
}

function isRecentlyTracked(ticket: LinearTicket, now: number) {
  const lastTrackedAt = parseDate(ticket.lastTrackedAt)

  if (!lastTrackedAt) {
    return false
  }

  return now - lastTrackedAt <= recentTrackedWindowMs
}

function compareStatus(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return (
    compareNumberAsc(getStatusTypeRank(firstTicket), getStatusTypeRank(secondTicket)) ||
    compareNumberAsc(firstTicket.status.position, secondTicket.status.position) ||
    firstTicket.status.name.localeCompare(secondTicket.status.name) ||
    compareDateDesc(firstTicket.updatedAt, secondTicket.updatedAt)
  )
}

function getStatusTypeRank(ticket: LinearTicket) {
  return linearStatusTypeRank[ticket.status.type] ?? linearStatusTypeRank.duplicate + 1
}

function compareAlphabetical(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return firstTicket.title.localeCompare(secondTicket.title) || compareStable(firstTicket, secondTicket)
}

function compareStable(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return firstTicket.identifier.localeCompare(secondTicket.identifier)
}

function compareLastTrackedDesc(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return compareNumberDesc(parseDate(firstTicket.lastTrackedAt), parseDate(secondTicket.lastTrackedAt))
}

function compareDateDesc(firstDate: string, secondDate: string) {
  return compareNumberDesc(parseDate(firstDate), parseDate(secondDate))
}

function parseDate(date: string | null) {
  if (!date) {
    return 0
  }

  const timestamp = Date.parse(date)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareNumberAsc(firstNumber: number, secondNumber: number) {
  return firstNumber - secondNumber
}

function compareNumberDesc(firstNumber: number, secondNumber: number) {
  return secondNumber - firstNumber
}

function linearTicketsLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[linear tickets] ${message}`)
    return
  }

  console.info(`[linear tickets] ${message}`, details)
}
