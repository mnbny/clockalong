import type { clockify } from '../clockify/client'
import type { ClockifyScope } from '../clockify/entry-cache'
import type { CreateTimeEntryRequest, TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'

import axios from 'axios'

import { db } from '../db'

// Clockify's running-entry list can omit an entry for a few seconds after it is written.
const runningListLagMs = 60_000

export type TrackedTimer = {
  timerId: string
  userId: string
  workspaceId: string
  projectName: string
  callerId: string | null
  source: 'github' | 'linear' | 'quick_timer'
  sourceId: string
  mode: 'clockify' | 'internal'
  body: CreateTimeEntryRequest
  entryId: string | null
  startedAt: string
  endedAt: string | null
  state: 'starting' | 'active' | 'saving' | 'failed'
  uncertain: boolean
  error: string | null
}

export function readTrackedTimers(userId: string) {
  return db.trackedTimers.where('userId').equals(userId).sortBy('startedAt')
}

export function removeClockifyTimerReference({ id, userId, workspaceId }: TimeEntryWithRatesDtoV1) {
  if (!id || !userId || !workspaceId) return Promise.resolve(0)
  return db.trackedTimers
    .where('[userId+workspaceId]')
    .equals([userId, workspaceId])
    .filter(timer => timer.mode === 'clockify' && timer.entryId === id)
    .delete()
}

/**
 * Removes Clockify timer references only when Clockify confirms their entry ended or no longer exists.
 * Absence from the running list is not proof, because that list lags behind new writes.
 * Returns the references that may still be running.
 */
export async function retireEndedClockifyTimers(
  client: typeof clockify,
  scope: ClockifyScope,
  running: TimeEntryWithRatesDtoV1[],
) {
  const timers = await db.trackedTimers
    .where('[userId+workspaceId]')
    .equals([scope.userId, scope.workspaceId])
    .filter(timer => timer.mode === 'clockify')
    .toArray()
  const remaining: TrackedTimer[] = []
  for (const timer of timers) {
    const settled = Date.now() - Date.parse(timer.startedAt) >= runningListLagMs
    if (!settled || running.some(entry => entry.id === timer.entryId)) remaining.push(timer)
    // A settled start without an entry ID cannot be matched; any entry it created is listed as running on its own.
    else if (timer.entryId && !(await hasClockifyEntryEnded(client, timer.entryId, timer.workspaceId)))
      remaining.push(timer)
    else await db.trackedTimers.delete(timer.timerId)
  }
  return remaining
}

async function hasClockifyEntryEnded(client: typeof clockify, id: string, workspaceId: string) {
  try {
    return !!(await client.getTimeEntry({ params: { id, workspaceId } })).timeInterval?.end
  } catch (error) {
    // Clockify can reject a lookup for a deleted entry with 400 instead of 404.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    return status === 400 || status === 404
  }
}

export function describeTrackedTimer(timer: TrackedTimer, now = Date.now()) {
  return {
    timerId: timer.timerId,
    stopArguments: { timerId: timer.timerId },
    mode: timer.mode,
    state: timer.state === 'active' && timer.endedAt ? 'stopped' : timer.state,
    callerId: timer.callerId,
    source: timer.source,
    sourceId: timer.sourceId,
    workspaceId: timer.workspaceId,
    projectName: timer.projectName,
    entryId: timer.entryId,
    description: timer.body.description ?? '',
    billable: timer.body.billable ?? false,
    startedAt: timer.startedAt,
    endedAt: timer.endedAt,
    elapsedSeconds: Math.max(
      0,
      Math.floor(((timer.endedAt ? Date.parse(timer.endedAt) : now) - Date.parse(timer.startedAt)) / 1000),
    ),
    uncertain: timer.uncertain,
    error: timer.error,
  }
}
