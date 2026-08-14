import type { ClockifyProject } from '../storage/config'
import type { CreateTimeEntryRequest, TimeEntryWithRatesDtoV1 } from './generated/clockify'

import { clockify } from './client'

export class MissingClockifyProjectError extends Error {
  constructor() {
    super('Missing Clockify project.')
  }
}

export function getClockifyTimeEntryTitle(entry: TimeEntryWithRatesDtoV1) {
  return entry.description?.trim() || 'Untitled time entry'
}

export async function resumeClockifyTimeEntry(entry: TimeEntryWithRatesDtoV1, project: ClockifyProject | null = null) {
  const workspaceId = project?.workspaceId ?? entry.workspaceId

  if (!workspaceId) {
    throw new Error('Clockify entry is missing workspace information.')
  }

  return clockify.createTimeEntry(getClockifyTimeEntryResumeBody(entry, project), {
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

function getClockifyTimeEntryResumeBody(entry: TimeEntryWithRatesDtoV1, project: ClockifyProject | null) {
  const projectId = project?.projectId ?? entry.projectId
  const body: CreateTimeEntryRequest = {
    billable: entry.billable ?? false,
    start: new Date().toISOString(),
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
