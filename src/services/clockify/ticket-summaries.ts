import type { LinearTicket } from '../linear/tickets'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

import { formatInternalRef } from '../../utils/templates'
import {
  type ClockifyWorkItemTimeSummaries,
  getClockifyEntryWorkItem,
  summarizeClockifyWorkItemTimeEntries,
} from './work-item-summaries'

export type ClockifyTicketTimeSummary = ClockifyWorkItemTimeSummaries[string]
export type ClockifyTicketTimeSummaries = ClockifyWorkItemTimeSummaries

export function summarizeClockifyTicketTimeEntries({
  entries,
  now,
  tickets,
}: {
  entries: TimeEntryWithRatesDtoV1[]
  now?: Date
  tickets: LinearTicket[]
}) {
  return summarizeClockifyWorkItemTimeEntries({
    entries,
    getWorkItemId: ticket => ticket.id,
    getWorkItemInternalRef: getLinearTicketInternalRef,
    now,
    workItems: tickets,
  })
}

export function getClockifyEntryLinearTicket(entry: TimeEntryWithRatesDtoV1 | null, tickets: LinearTicket[]) {
  return getClockifyEntryWorkItem({
    entry,
    getWorkItemInternalRef: getLinearTicketInternalRef,
    workItems: tickets,
  })
}

export function getLinearTicketInternalRef(ticket: LinearTicket) {
  return formatInternalRef({
    issueIdentifier: ticket.identifier,
    provider: 'linear',
    workspaceSlug: getLinearWorkspaceSlug(ticket.url) ?? 'linear',
  })
}

function getLinearWorkspaceSlug(url: string) {
  try {
    const parsedUrl = new URL(url)
    const [workspaceSlug] = parsedUrl.pathname.split('/').filter(Boolean)
    return workspaceSlug
  } catch {
    return null
  }
}
