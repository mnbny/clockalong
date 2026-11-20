import type { CreateTimeEntryRequest } from '../clockify/generated/clockify'

import { db } from '../db'

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

export function describeTrackedTimer(timer: TrackedTimer, now = Date.now()) {
  return {
    timerId: timer.timerId,
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
