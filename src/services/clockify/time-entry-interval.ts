import type { CreateTimeEntryRequest } from './generated/clockify'

export type ClockifyTimeEntryInterval = {
  start: string
  end: string
}

export function getClockifyTimeEntryTiming(interval?: ClockifyTimeEntryInterval) {
  if (!interval) {
    return { start: new Date().toISOString() } satisfies CreateTimeEntryRequest
  }

  const start = new Date(interval.start)
  const end = new Date(interval.end)

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('Use a valid start and end time with a positive duration.')
  }

  return { start: start.toISOString(), end: end.toISOString() } satisfies CreateTimeEntryRequest
}

export function getClockifyTimeEntryIntervalFromMinutes(minutes: number, end = new Date()) {
  const start = new Date(end.getTime() - minutes * 60_000)

  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime())
  ) {
    throw new Error('Enter a positive duration in minutes.')
  }

  return { start: start.toISOString(), end: end.toISOString() }
}
