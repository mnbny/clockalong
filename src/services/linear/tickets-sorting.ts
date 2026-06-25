import type { ClockifyLinearEntryLinkRegistry, LinearTicketSortOrderOption } from '../storage/config'
import type { LinearTicket } from './tickets'

type TicketLinkSummary = {
  entryCount: number
  lastLinkedAt: number
}

type TicketLinkSummaries = Map<string, TicketLinkSummary>

export type SortLinearTicketsOptions = {
  clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry
  sortOrder: LinearTicketSortOrderOption
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
  const linkSummaries = summarizeTicketLinks(options.clockifyLinearEntryLinks)
  const sortedTickets = [...tickets].sort((firstTicket, secondTicket) => {
    switch (options.sortOrder) {
      case 'alphabetical':
        return compareAlphabetical(firstTicket, secondTicket)
      case 'created':
        return (
          compareDateDesc(firstTicket.createdAt, secondTicket.createdAt) || compareStable(firstTicket, secondTicket)
        )
      case 'custom':
        return compareCustom(firstTicket, secondTicket, linkSummaries)
      case 'status':
        return compareStatus(firstTicket, secondTicket) || compareStable(firstTicket, secondTicket)
      case 'updated':
        return (
          compareDateDesc(firstTicket.updatedAt, secondTicket.updatedAt) || compareStable(firstTicket, secondTicket)
        )
    }
  })

  logSortSummary(sortedTickets, options, linkSummaries)

  return sortedTickets
}

function logSortSummary(
  sortedTickets: LinearTicket[],
  options: SortLinearTicketsOptions,
  linkSummaries: TicketLinkSummaries,
) {
  const linkedTicketCount = [...linkSummaries.keys()].filter(linearIssueId =>
    sortedTickets.some(ticket => ticket.id === linearIssueId),
  ).length
  const topIdentifiers = sortedTickets.slice(0, 5).map(ticket => ticket.identifier)
  const signature = JSON.stringify({
    count: sortedTickets.length,
    linkedTicketCount,
    sortOrder: options.sortOrder,
    topIdentifiers,
  })

  if (signature === previousSortLogSignature) {
    return
  }

  previousSortLogSignature = signature
  linearTicketsLog('sort complete', {
    linkedTicketCount,
    sortOrder: options.sortOrder,
    topIdentifiers,
    totalTickets: sortedTickets.length,
  })
}

function summarizeTicketLinks(clockifyLinearEntryLinks: ClockifyLinearEntryLinkRegistry) {
  const summaries: TicketLinkSummaries = new Map()

  for (const link of Object.values(clockifyLinearEntryLinks)) {
    const currentSummary = summaries.get(link.linearIssueId) ?? {
      entryCount: 0,
      lastLinkedAt: 0,
    }
    const linkedAt = Date.parse(link.linkedAt)

    summaries.set(link.linearIssueId, {
      entryCount: currentSummary.entryCount + 1,
      lastLinkedAt: Math.max(currentSummary.lastLinkedAt, Number.isFinite(linkedAt) ? linkedAt : 0),
    })
  }

  return summaries
}

function compareCustom(firstTicket: LinearTicket, secondTicket: LinearTicket, linkSummaries: TicketLinkSummaries) {
  const firstSummary = linkSummaries.get(firstTicket.id)
  const secondSummary = linkSummaries.get(secondTicket.id)

  return (
    compareNumberDesc(firstSummary?.lastLinkedAt ?? 0, secondSummary?.lastLinkedAt ?? 0) ||
    compareNumberDesc(firstSummary?.entryCount ?? 0, secondSummary?.entryCount ?? 0) ||
    compareStatus(firstTicket, secondTicket) ||
    compareDateDesc(firstTicket.updatedAt, secondTicket.updatedAt) ||
    compareStable(firstTicket, secondTicket)
  )
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
  return linearStatusTypeRank[ticket.status.type] ?? linearStatusTypeRank.backlog
}

function compareAlphabetical(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return firstTicket.title.localeCompare(secondTicket.title) || compareStable(firstTicket, secondTicket)
}

function compareStable(firstTicket: LinearTicket, secondTicket: LinearTicket) {
  return firstTicket.identifier.localeCompare(secondTicket.identifier)
}

function compareDateDesc(firstDate: string, secondDate: string) {
  return compareNumberDesc(parseDate(firstDate), parseDate(secondDate))
}

function parseDate(date: string) {
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
