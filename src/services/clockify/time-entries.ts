import type { ClockifyProject } from '../storage/config'
import type { CreateTimeEntryRequest, TimeEntryWithRatesDtoV1, UpdateTimeEntryRequest } from './generated/clockify'

import { db } from '../db'
import { coordinateClockifyTimer } from '../tracking/mutations'
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

  return createClockifyTimeEntry(getClockifyTimeEntryCopyBody(entry, project, interval), workspaceId)
}

export function createClockifyTimeEntry(body: CreateTimeEntryRequest, workspaceId: string) {
  const create = () => clockify.createTimeEntry(body, { params: { workspaceId } })
  return body.end
    ? create()
    : coordinateClockifyTimer(async () => {
        const entry = await create()
        if (entry.userId && entry.id && entry.timeInterval?.start) {
          try {
            await db.trackedTimers
              .where('[userId+workspaceId]')
              .equals([entry.userId, workspaceId])
              .filter(
                timer =>
                  timer.mode === 'clockify' && timer.entryId !== entry.id && timer.state === 'active' && !timer.endedAt,
              )
              .modify({ endedAt: entry.timeInterval.start })
          } catch {
            console.warn('[clockify sync] Could not update replaced timer display.')
          }
        }
        return entry
      })
}

export function stopClockifyTimeEntry(entry: TimeEntryWithRatesDtoV1) {
  const end = new Date()
  return coordinateClockifyTimer(async () => {
    const result = await endClockifyTimeEntry(clockify, entry, end)
    try {
      await db.trackedTimers
        .filter(
          timer =>
            timer.mode === 'clockify' &&
            timer.entryId === entry.id &&
            timer.userId === entry.userId &&
            timer.workspaceId === entry.workspaceId,
        )
        .modify({ endedAt: result.timeInterval?.end ?? end.toISOString() })
    } catch {
      console.warn('[clockify sync] Could not update stopped timer display.')
    }
    return result
  })
}

export async function endClockifyTimeEntry(client: typeof clockify, entry: TimeEntryWithRatesDtoV1, end: Date) {
  if (!entry.id || !entry.userId || !entry.workspaceId) {
    throw new Error('Clockify timer is missing its entry, user or workspace ID.')
  }
  const params = { id: entry.id, workspaceId: entry.workspaceId }
  const current = await client.getTimeEntry({ params })
  if (
    current.id !== entry.id ||
    current.userId !== entry.userId ||
    (current.workspaceId && current.workspaceId !== entry.workspaceId) ||
    !current.timeInterval?.start
  ) {
    throw new Error('Clockify returned a different or incomplete timer.')
  }
  if (current.timeInterval.end) return current
  const body = getClockifyTimeEntryUpdateBody(current, new Date(current.timeInterval.start), end)
  const result = await client.updateTimeEntry(body, { params })
  if (result.id && result.id !== entry.id) throw new Error('Clockify returned a different timer.')
  return {
    ...current,
    ...result,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
    timeInterval: { ...current.timeInterval, ...result.timeInterval, end: result.timeInterval?.end ?? body.end },
  }
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

  if (entry.customFieldValues?.length) {
    body.customFields = entry.customFieldValues.map(field => {
      if (!field.customFieldId) throw new Error('Clockify custom field is missing its identifier.')
      return { customFieldId: field.customFieldId, value: field.value }
    })
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

  if (entry.customFieldValues?.length) {
    body.customFields = entry.customFieldValues.map(field => {
      if (!field.customFieldId) throw new Error('Clockify custom field is missing its identifier.')
      return { customFieldId: field.customFieldId, value: field.value }
    })
  }

  return body
}
