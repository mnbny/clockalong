import { getInternalRefKeys, type InternalRef, normalizeInternalRef } from '../../utils/templates'
import { type TimeEntryWithRatesDtoV1 } from './generated/clockify'

export type ClockifyWorkItemTimeSummary = {
  lastTrackedAt: string | null
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number
}

export type ClockifyWorkItemTimeSummaries = Record<string, ClockifyWorkItemTimeSummary>

export function addClockifyEntrySummary(
  current: ClockifyWorkItemTimeSummary | undefined,
  entry: TimeEntryWithRatesDtoV1,
  now: Date,
) {
  const summary = current ?? {
    lastTrackedAt: null,
    totalTrackedAmount: null,
    totalTrackedAmountCurrency: null,
    totalTrackedSeconds: 0,
  }
  const amount = getEntryTrackedAmount(entry, now)
  return {
    lastTrackedAt: getLatestDateString(summary.lastTrackedAt, getEntryLastTrackedAt(entry)),
    totalTrackedAmount: getNextTrackedAmount(summary, amount),
    totalTrackedAmountCurrency: summary.totalTrackedAmountCurrency ?? amount?.currency ?? null,
    totalTrackedSeconds: summary.totalTrackedSeconds + getEntryDurationSeconds(entry, now),
  }
}

export function getClockifyEntryWorkItem<TWorkItem>({
  entry,
  getWorkItemInternalRef,
  workItems,
}: {
  entry: TimeEntryWithRatesDtoV1 | null
  getWorkItemInternalRef: (workItem: TWorkItem) => string
  workItems: TWorkItem[]
}) {
  if (!entry) {
    return null
  }

  return createClockifyEntryMatcher(workItems, getWorkItemInternalRef)(entry)
}

export function createClockifyEntryMatcher<TWorkItem>(
  workItems: TWorkItem[],
  getWorkItemInternalRef: (item: TWorkItem) => string,
) {
  const workItemByInternalRef = getWorkItemByInternalRef({ getWorkItemInternalRef, workItems })
  return (entry: TimeEntryWithRatesDtoV1) => getClockifyEntryWorkItemByInternalRef({ entry, workItemByInternalRef })
}

export function resolveClockifyEntryOwners(
  entries: TimeEntryWithRatesDtoV1[],
  provider: InternalRef['provider'],
  byRef: Map<string, string>,
) {
  return new Map(
    entries.flatMap(entry => {
      const owner = getInternalRefKeys(entry.description, provider)
        .map(ref => byRef.get(ref))
        .find(Boolean)
      return entry.id && owner ? [[entry.id, owner] as const] : []
    }),
  )
}

function getWorkItemByInternalRef<TWorkItem>({
  getWorkItemInternalRef,
  workItems,
}: {
  getWorkItemInternalRef: (workItem: TWorkItem) => string
  workItems: TWorkItem[]
}) {
  return new Map(workItems.map(workItem => [normalizeInternalRef(getWorkItemInternalRef(workItem)), workItem]))
}

function getClockifyEntryWorkItemByInternalRef<TWorkItem>({
  entry,
  workItemByInternalRef,
}: {
  entry: TimeEntryWithRatesDtoV1
  workItemByInternalRef: Map<string, TWorkItem>
}) {
  for (const refKey of getInternalRefKeys(entry.description)) {
    const workItem = workItemByInternalRef.get(refKey)

    if (workItem) {
      return workItem
    }
  }

  return null
}

function getEntryLastTrackedAt(entry: TimeEntryWithRatesDtoV1) {
  return entry.timeInterval?.end ?? entry.timeInterval?.start ?? null
}

function getLatestDateString(current: string | null, next: string | null) {
  if (!next) {
    return current
  }

  if (!current) {
    return next
  }

  return Date.parse(next) > Date.parse(current) ? next : current
}

function getEntryDurationSeconds(entry: TimeEntryWithRatesDtoV1, now: Date) {
  const start = parseDate(entry.timeInterval?.start)
  const end = parseDate(entry.timeInterval?.end) ?? now

  if (!start) {
    return 0
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
}

function getEntryTrackedAmount(entry: TimeEntryWithRatesDtoV1, now: Date) {
  const durationSeconds = getEntryDurationSeconds(entry, now)
  const hourlyAmount = entry.hourlyRate?.amount
  const currency = entry.hourlyRate?.currency

  if (!durationSeconds || typeof hourlyAmount !== 'number' || !currency) {
    return null
  }

  return {
    amount: (hourlyAmount * durationSeconds) / 3600 / 100,
    currency,
  }
}

function getNextTrackedAmount(
  currentSummary: ClockifyWorkItemTimeSummary,
  entryAmount: { amount: number; currency: string } | null,
) {
  if (!entryAmount) {
    return currentSummary.totalTrackedAmount
  }

  if (currentSummary.totalTrackedAmountCurrency && currentSummary.totalTrackedAmountCurrency !== entryAmount.currency) {
    return currentSummary.totalTrackedAmount
  }

  return (currentSummary.totalTrackedAmount ?? 0) + entryAmount.amount
}

function parseDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
