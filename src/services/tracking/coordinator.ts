import type { UserDtoV1 } from '../clockify/generated/clockify'
import type { TrackedTimer } from './store'

import axios from 'axios'

import { queryClient, queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { clockifyEntryCache } from '../clockify/entry-cache'
import { cacheClockifyEntryResult } from '../clockify/sync'
import { endClockifyTimeEntry } from '../clockify/time-entries'
import { db } from '../db'
import { storage } from '../storage/config'
import { coordinateClockifyTimer, getTrackingSession } from './mutations'
import { describeTrackedTimer, readTrackedTimers } from './store'

const stops = new Map<string, ReturnType<typeof finishTimer>>()
let restoration: Promise<void> | undefined

export function restoreTrackedTimers() {
  return (restoration ??= db.trackedTimers
    .filter(timer => timer.state === 'starting' || timer.state === 'saving')
    .modify({
      state: 'failed',
      uncertain: true,
      error: 'The previous request was interrupted. Check Clockify before retrying.',
    })
    .then(() => {}))
}

export async function startTrackedTimer(
  input: Pick<TrackedTimer, 'workspaceId' | 'projectName' | 'callerId' | 'source' | 'sourceId' | 'body'>,
  deadlineAt = Infinity,
  lifecycle = clockifyEntryCache.getLifecycle(),
) {
  const startedAt = input.body.start ?? new Date().toISOString()
  await restoreTrackedTimers()
  if (lifecycle !== clockifyEntryCache.getLifecycle())
    throw new Error('Clockify account changed before the timer started.')
  const session = await getTrackingSession()
  return coordinateClockifyTimer(async () => {
    const check = () => {
      session.assertCurrent()
      if (session.lifecycle !== lifecycle) throw new Error('Clockify account changed before the timer started.')
      if (Date.now() >= deadlineAt) throw new Error('Timer start expired before execution. No timer was started.')
    }
    check()
    const running = await session.client.getTimeEntries({
      params: { userId: session.userId, workspaceId: input.workspaceId },
      queries: { 'in-progress': 'true', 'page-size': 1, page: 1 },
    })
    check()
    const unresolvedStart = (await readTrackedTimers(session.userId)).some(
      timer =>
        timer.workspaceId === input.workspaceId && timer.mode === 'clockify' && !timer.entryId && timer.uncertain,
    )
    const mode = running.length || unresolvedStart ? 'internal' : 'clockify'
    let timer: TrackedTimer = {
      ...input,
      body: { ...input.body, start: startedAt },
      timerId: crypto.randomUUID(),
      userId: session.userId,
      startedAt,
      endedAt: null,
      mode,
      entryId: null,
      state: mode === 'internal' ? 'active' : 'starting',
      uncertain: mode === 'clockify',
      error: null,
    }
    await db.trackedTimers.add(timer)
    if (mode === 'internal') return describeTrackedTimer(timer)
    let sent = false
    try {
      check()
      sent = true
      const entry = await session.client.createTimeEntry(timer.body, { params: { workspaceId: timer.workspaceId } })
      if (!entry.id || !entry.timeInterval?.start)
        throw new Error('Clockify returned an incomplete timer. Check Clockify before starting again.')
      timer = { ...timer, entryId: entry.id, startedAt: entry.timeInterval.start, state: 'active', uncertain: false }
      await db.trackedTimers.put(timer)
      if (session.lifecycle === clockifyEntryCache.getLifecycle()) {
        queryClient.setQueryData(
          queryKeys.clockify.runningEntry({ params: { userId: timer.userId, workspaceId: timer.workspaceId } }),
          [entry],
        )
      }
      invalidateTracking()
      return describeTrackedTimer(timer)
    } catch (error) {
      if (!sent || isRejectedWrite(error)) await db.trackedTimers.delete(timer.timerId)
      else
        await db.trackedTimers.update(timer.timerId, {
          state: 'failed',
          uncertain: true,
          error: 'Timer start is unconfirmed. Check Clockify before starting again.',
        })
      throw error
    }
  })
}

export function stopTrackedTimer(timerId: string, retryUncertain = false) {
  const existing = stops.get(timerId)
  if (existing) return existing
  const endedAt = new Date().toISOString()
  const result = finishTimer(timerId, endedAt, retryUncertain).finally(() => stops.delete(timerId))
  stops.set(timerId, result)
  return result
}

async function finishTimer(timerId: string, requestedEnd: string, retryUncertain: boolean) {
  await restoreTrackedTimers()
  let timer = await db.trackedTimers.get(timerId)
  if (!timer)
    throw new Error('Timer is no longer active or is unknown. No time was added; do not backfill automatically.')
  if (queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)?.id !== timer.userId) {
    throw new Error('Reconnect the original Clockify account before saving this timer.')
  }
  timer = { ...timer, endedAt: timer.endedAt ?? requestedEnd }
  const needsReview = (timer.uncertain || timer.state === 'saving') && !retryUncertain && timer.mode === 'internal'
  await db.trackedTimers.put({ ...timer, state: needsReview ? 'failed' : 'saving' })
  if (needsReview) {
    throw new Error(
      'The previous save is unconfirmed. Check Clockify before retrying in the app; do not add time manually through MCP.',
    )
  }
  const record = timer
  const save = async () => {
    let sent = false
    try {
      const session = await getTrackingSession(record.userId)
      session.assertCurrent()
      if (record.mode === 'clockify' && !record.entryId)
        throw new Error('The Clockify start is unconfirmed. Check Clockify and handle this interval manually.')
      await db.trackedTimers.update(timerId, { state: 'saving', uncertain: true, error: null })
      session.assertCurrent()
      sent = true
      const entry =
        record.mode === 'internal'
          ? await session.client.createTimeEntry(
              { ...record.body, start: record.startedAt, end: record.endedAt! },
              { params: { workspaceId: record.workspaceId } },
            )
          : await endClockifyTimeEntry(
              session.client,
              { id: record.entryId!, userId: record.userId, workspaceId: record.workspaceId },
              new Date(record.endedAt!),
            )
      if (!entry.id || !entry.timeInterval?.start || !entry.timeInterval.end)
        throw new Error('Clockify returned an incomplete saved entry.')
      await db.trackedTimers.delete(timerId)
      return { ...entry, mode: record.mode, userId: record.userId, workspaceId: record.workspaceId }
    } catch (error) {
      const uncertain = sent ? !isRejectedWrite(error) : record.uncertain
      await db.trackedTimers.update(timerId, {
        state: 'failed',
        uncertain,
        error: uncertain
          ? 'Saving is unconfirmed. Check Clockify before retrying to avoid duplicate time.'
          : getErrorMessage(error),
      })
      if (uncertain)
        throw Object.assign(
          new Error('Timer save is unconfirmed. Check Clockify before retrying; do not backfill automatically.'),
          { cause: error },
        )
      throw error
    }
  }
  return record.mode === 'clockify' ? coordinateClockifyTimer(save) : save()
}

export async function refreshStoppedTimer(entry: Awaited<ReturnType<typeof stopTrackedTimer>>, lifecycle: number) {
  try {
    await cacheClockifyEntryResult(entry, {}, lifecycle)
    if (entry.mode === 'clockify')
      await storage.set('quickTimersActiveEntry', current => (current?.entryId === entry.id ? null : current))
  } catch {
    console.warn('[clockify sync] Timer saved; local display refresh failed.')
  }
  invalidateTracking()
}

export function invalidateTracking() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
  void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
}

function isRejectedWrite(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  return status !== undefined && status >= 400 && status < 500 && status !== 408
}
