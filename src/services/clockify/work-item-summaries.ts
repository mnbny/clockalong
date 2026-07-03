import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { type TimeEntryWithRatesDtoV1 } from './generated/clockify'

export type ClockifyWorkItemTimeSummary = {
  lastTrackedAt: string | null
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number
}

export type ClockifyWorkItemTimeSummaries = Record<string, ClockifyWorkItemTimeSummary>

export type SummarizeClockifyWorkItemTimeEntriesOptions<TWorkItem> = {
  entries: TimeEntryWithRatesDtoV1[]
  getFallbackEntryWorkItem?: (entry: TimeEntryWithRatesDtoV1, workItems: TWorkItem[]) => TWorkItem | null
  getWorkItemId: (workItem: TWorkItem) => string
  getWorkItemInternalRef: (workItem: TWorkItem) => string
  now?: Date
  workItems: TWorkItem[]
}

export function summarizeClockifyWorkItemTimeEntries<TWorkItem>({
  entries,
  getFallbackEntryWorkItem,
  getWorkItemId,
  getWorkItemInternalRef,
  now = new Date(),
  workItems,
}: SummarizeClockifyWorkItemTimeEntriesOptions<TWorkItem>) {
  const uniqueEntries = getUniqueClockifyEntries(entries)
  const workItemByInternalRef = getWorkItemByInternalRef({
    getWorkItemInternalRef,
    workItems,
  })
  const summaries: ClockifyWorkItemTimeSummaries = {}

  for (const entry of uniqueEntries.values()) {
    const workItem =
      getClockifyEntryWorkItemByInternalRef({ entry, workItemByInternalRef }) ??
      getFallbackEntryWorkItem?.(entry, workItems) ??
      null

    if (!workItem) {
      continue
    }

    const workItemId = getWorkItemId(workItem)
    const currentSummary = summaries[workItemId] ?? {
      lastTrackedAt: null,
      totalTrackedAmount: null,
      totalTrackedAmountCurrency: null,
      totalTrackedSeconds: 0,
    }
    const lastTrackedAt = getEntryLastTrackedAt(entry)
    const entryAmount = getEntryTrackedAmount(entry, now)

    summaries[workItemId] = {
      lastTrackedAt: getLatestDateString(currentSummary.lastTrackedAt, lastTrackedAt),
      totalTrackedAmount: getNextTrackedAmount(currentSummary, entryAmount),
      totalTrackedAmountCurrency: currentSummary.totalTrackedAmountCurrency ?? entryAmount?.currency ?? null,
      totalTrackedSeconds: currentSummary.totalTrackedSeconds + getEntryDurationSeconds(entry, now),
    }
  }

  return summaries
}

export function getClockifyEntryWorkItem<TWorkItem>({
  entry,
  getFallbackEntryWorkItem,
  getWorkItemInternalRef,
  workItems,
}: {
  entry: TimeEntryWithRatesDtoV1 | null
  getFallbackEntryWorkItem?: (entry: TimeEntryWithRatesDtoV1, workItems: TWorkItem[]) => TWorkItem | null
  getWorkItemInternalRef: (workItem: TWorkItem) => string
  workItems: TWorkItem[]
}) {
  if (!entry) {
    return null
  }

  return (
    getClockifyEntryWorkItemByInternalRef({
      entry,
      workItemByInternalRef: getWorkItemByInternalRef({ getWorkItemInternalRef, workItems }),
    }) ??
    getFallbackEntryWorkItem?.(entry, workItems) ??
    null
  )
}

function getUniqueClockifyEntries(entries: TimeEntryWithRatesDtoV1[]) {
  const uniqueEntries = new Map<string, TimeEntryWithRatesDtoV1>()

  for (const entry of entries) {
    if (entry.id) {
      uniqueEntries.set(entry.id, entry)
    }
  }

  return uniqueEntries
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
  const internalRefs = parseInternalRefs(entry.description)

  for (const internalRef of internalRefs) {
    const workItem = workItemByInternalRef.get(normalizeInternalRef(formatInternalRef(internalRef)))

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
