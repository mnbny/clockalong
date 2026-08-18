import type { LinearTicket } from './tickets'

import { internalRefTemplateToken, parseTemplateTokens } from '../../utils/templates'
import { clockify } from '../clockify/client'
import {
  type ClockifyDescriptionTemplateValues,
  formatClockifyDescriptionTemplate,
} from '../clockify/description-template'
import {
  type CreateTimeEntryRequest,
  type TimeEntryDtoImplV1,
  type TimeEntryWithRatesDtoV1,
} from '../clockify/generated/clockify'
import { getLinearTicketInternalRef } from '../clockify/ticket-summaries'

export async function startClockifyTimerForTicket({
  billable,
  descriptionTemplate,
  descriptionTemplateFallback,
  projectId,
  ticket,
  workspaceId,
}: {
  billable: boolean
  descriptionTemplate: string
  descriptionTemplateFallback: string
  projectId: string
  ticket: LinearTicket
  workspaceId: string
}): Promise<TimeEntryDtoImplV1> {
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
    start: new Date().toISOString(),
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

  return clockify.createTimeEntry(body, { params: { workspaceId } })
}

export async function stopClockifyTimerForEntry({
  entry,
  ticket,
}: {
  entry: TimeEntryDtoImplV1
  ticket: LinearTicket
}): Promise<TimeEntryWithRatesDtoV1> {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  clockifyTimerLog('stop time entry request', {
    clockifyEntryId: entry.id,
    ticketIdentifier: ticket.identifier,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  })

  const end = new Date().toISOString()
  const stoppedEntry = await clockify.stopRunningTimeEntry(
    { end },
    { params: { userId: entry.userId, workspaceId: entry.workspaceId } },
  )

  return {
    ...entry,
    ...stoppedEntry,
    timeInterval: {
      ...entry.timeInterval,
      ...stoppedEntry.timeInterval,
      end: stoppedEntry.timeInterval?.end ?? end,
    },
  }
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
