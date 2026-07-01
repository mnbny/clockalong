import type { LinearTicket } from '../linear/tickets'
import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

export type ClockifyTicketTimeSummary = {
  lastTrackedAt: string | null
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number
}

export type ClockifyTicketTimeSummaries = Record<string, ClockifyTicketTimeSummary>

export function summarizeClockifyTicketTimeEntries({
  entries,
  now = new Date(),
  tickets,
}: {
  entries: TimeEntryWithRatesDtoV1[]
  now?: Date
  tickets: LinearTicket[]
}) {
  const ticketIdentifiers = getTicketIdentifiers(tickets)
  const uniqueEntries = new Map<string, TimeEntryWithRatesDtoV1>()

  for (const entry of entries) {
    if (entry.id) {
      uniqueEntries.set(entry.id, entry)
    }
  }

  const summaries: ClockifyTicketTimeSummaries = {}

  for (const entry of uniqueEntries.values()) {
    const ticket = getEntryTicket(entry, ticketIdentifiers)

    if (!ticket) {
      continue
    }

    const currentSummary = summaries[ticket.id] ?? {
      lastTrackedAt: null,
      totalTrackedAmount: null,
      totalTrackedAmountCurrency: null,
      totalTrackedSeconds: 0,
    }
    const lastTrackedAt = getEntryLastTrackedAt(entry)
    const entryAmount = getEntryTrackedAmount(entry, now)

    summaries[ticket.id] = {
      lastTrackedAt: getLatestDateString(currentSummary.lastTrackedAt, lastTrackedAt),
      totalTrackedAmount: getNextTrackedAmount(currentSummary, entryAmount),
      totalTrackedAmountCurrency: currentSummary.totalTrackedAmountCurrency ?? entryAmount?.currency ?? null,
      totalTrackedSeconds: currentSummary.totalTrackedSeconds + getEntryDurationSeconds(entry, now),
    }
  }

  return summaries
}

export function getClockifyEntryLinearTicket(entry: TimeEntryWithRatesDtoV1 | null, tickets: LinearTicket[]) {
  if (!entry) {
    return null
  }

  return getEntryTicket(entry, getTicketIdentifiers(tickets))
}

function getTicketIdentifiers(tickets: LinearTicket[]) {
  return tickets
    .map(ticket => ({
      normalizedIdentifier: ticket.identifier.toLocaleLowerCase(),
      ticket,
    }))
    .sort((first, second) => second.normalizedIdentifier.length - first.normalizedIdentifier.length)
}

function getEntryTicket(entry: TimeEntryWithRatesDtoV1, ticketIdentifiers: ReturnType<typeof getTicketIdentifiers>) {
  const normalizedDescription = entry.description?.toLocaleLowerCase()

  if (!normalizedDescription) {
    return null
  }

  return (
    ticketIdentifiers.find(({ normalizedIdentifier }) => normalizedDescription.includes(normalizedIdentifier))
      ?.ticket ?? null
  )
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
  currentSummary: ClockifyTicketTimeSummary,
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
