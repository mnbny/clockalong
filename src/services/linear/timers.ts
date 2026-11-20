import type { LinearTicket } from './tickets'

import { internalRefTemplateToken, parseTemplateTokens } from '../../utils/templates'
import {
  type ClockifyDescriptionTemplateValues,
  formatClockifyDescriptionTemplate,
} from '../clockify/description-template'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../clockify/generated/clockify'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'
import { createClockifyTimeEntry, stopClockifyTimeEntry } from '../clockify/time-entries'
import { type ClockifyTimeEntryInterval, getClockifyTimeEntryTiming } from '../clockify/time-entry-interval'

export function getTicketTimeEntryBody({
  interval,
  billable,
  descriptionTemplate,
  descriptionTemplateFallback,
  projectId,
  ticket,
  workspaceId,
}: {
  interval?: ClockifyTimeEntryInterval
  billable: boolean
  descriptionTemplate: string
  descriptionTemplateFallback: string
  projectId: string
  ticket: LinearTicket
  workspaceId: string
}) {
  const descriptionValues = {
    assigneeName: ticket.assignee?.displayName ?? ticket.assignee?.name,
    identifier: ticket.identifier,
    [internalRefTemplateToken]: getLinearTicketInternalRef(ticket),
    number: getLinearTicketNumber(ticket.identifier),
    stateName: ticket.status.name,
    teamKey: getLinearTicketTeamKey(ticket.identifier),
    title: ticket.title,
    url: ticket.url,
  } satisfies ClockifyDescriptionTemplateValues
  const body = {
    billable,
    description: formatClockifyDescriptionTemplate(descriptionTemplate, descriptionValues, {
      fallback: descriptionTemplateFallback,
    }),
    projectId,
    ...getClockifyTimeEntryTiming(interval),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest
  const templateTokens = parseTemplateTokens(descriptionTemplate)
  const missingTemplateTokens = templateTokens.filter(token => {
    const value = descriptionValues[token as keyof typeof descriptionValues]
    return value === null || value === undefined || (typeof value === 'string' && !value.trim())
  })

  clockifyTimerLog('create time entry request', {
    billable,
    descriptionLength: body.description.length,
    missingTemplateTokens,
    projectId,
    ticketIdentifier: ticket.identifier,
    templateTokens,
    urlPresent: Boolean(descriptionValues.url),
    workspaceId,
  })

  return body
}

export async function stopClockifyTimerForEntry({
  entry,
  ticket,
}: {
  entry: TimeEntryDtoImplV1
  ticket: LinearTicket
}) {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  clockifyTimerLog('stop time entry request', {
    clockifyEntryId: entry.id,
    ticketIdentifier: ticket.identifier,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  })

  return stopClockifyTimeEntry(entry)
}

function getLinearTicketNumber(identifier: string) {
  const identifierParts = identifier.split('-')
  const number = Number(identifierParts[identifierParts.length - 1])
  return Number.isFinite(number) ? number : undefined
}

function getLinearTicketTeamKey(identifier: string) {
  const [teamKey] = identifier.split('-')
  return teamKey || undefined
}

function clockifyTimerLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify api] timer ${message}`)
    return
  }

  console.info(`[clockify api] timer ${message}`, details)
}

export function createClockifyTimeEntryForTicket(input: Parameters<typeof getTicketTimeEntryBody>[0]) {
  return createClockifyTimeEntry(getTicketTimeEntryBody(input), input.workspaceId)
}
