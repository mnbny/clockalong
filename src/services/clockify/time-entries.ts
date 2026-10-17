import type { ClockifyProject } from '../storage/config'
import type { CreateTimeEntryRequest, TimeEntryWithRatesDtoV1, UpdateTimeEntryRequest } from './generated/clockify'

import { clockify } from './client'
import { type ClockifyTimeEntryInterval, getClockifyTimeEntryTiming } from './time-entry-interval'

export class MissingClockifyProjectError extends Error {
  constructor() {
    super('Missing Clockify project.')
  }
}

export function getClockifyTimeEntryTitle(entry: TimeEntryWithRatesDtoV1) {
  return entry.description?.trim() || 'Untitled time entry'
}

export async function createClockifyTimeEntryFromEntry(
  entry: TimeEntryWithRatesDtoV1,
  project: ClockifyProject | null = null,
  interval?: ClockifyTimeEntryInterval,
) {
  const workspaceId = project?.workspaceId ?? entry.workspaceId

  if (!workspaceId) {
    throw new Error('Clockify entry is missing workspace information.')
  }

  return clockify.createTimeEntry(getClockifyTimeEntryCopyBody(entry, project, interval), {
    params: { workspaceId },
  })
}

export async function stopClockifyTimeEntry(entry: TimeEntryWithRatesDtoV1) {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  return clockify.stopRunningTimeEntry(
    { end: new Date().toISOString() },
    { params: { userId: entry.userId, workspaceId: entry.workspaceId } },
  )
}

export function getClockifyTimeEntryUpdateBody(entry: TimeEntryWithRatesDtoV1, start: Date, end: Date) {
  const body: UpdateTimeEntryRequest = {
    billable: entry.billable ?? false,
    end: end.toISOString(),
    start: start.toISOString(),
  }

  if (entry.description !== undefined) {
    body.description = entry.description
  }

  if (entry.projectId) {
    body.projectId = entry.projectId
  }

  if (entry.taskId) {
    body.taskId = entry.taskId
  }

  if (entry.tagIds) {
    body.tagIds = entry.tagIds
  }

  if (entry.type === 'REGULAR' || entry.type === 'BREAK') {
    body.type = entry.type
  }

  return body
}

function getClockifyTimeEntryCopyBody(
  entry: TimeEntryWithRatesDtoV1,
  project: ClockifyProject | null,
  interval?: ClockifyTimeEntryInterval,
) {
  const projectId = project?.projectId ?? entry.projectId
  const body: CreateTimeEntryRequest = {
    billable: entry.billable ?? false,
    ...getClockifyTimeEntryTiming(interval),
    type: entry.type === 'BREAK' ? 'BREAK' : 'REGULAR',
  }

  if (entry.description !== undefined) {
    body.description = entry.description
  }

  if (projectId) {
    body.projectId = projectId
  }

  if (entry.taskId && projectId === entry.projectId) {
    body.taskId = entry.taskId
  }

  if (entry.tagIds) {
    body.tagIds = entry.tagIds
  }

  return body
}
