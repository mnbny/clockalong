import { PaginationOrderBy } from '@linear/sdk'

export const linearTicketsPageSize = 50
export const defaultLinearTicketSyncLimit = linearTicketsPageSize
export const linearTicketSyncIntervalOptions = ['manual', '5m', '15m', '30m', '1h'] as const
export const linearTicketSyncOrderByOptions = [PaginationOrderBy.CreatedAt, PaginationOrderBy.UpdatedAt] as const
export const linearTicketSortOrderOptions = ['custom', 'status', 'created', 'updated', 'alphabetical'] as const

export type LinearTicketSyncIntervalOption = (typeof linearTicketSyncIntervalOptions)[number]
export type LinearTicketSyncOrderByOption = (typeof linearTicketSyncOrderByOptions)[number]
export type LinearTicketSortOrderOption = (typeof linearTicketSortOrderOptions)[number]

export const defaultLinearTicketSyncInterval: LinearTicketSyncIntervalOption = '30m'
export const defaultLinearTicketSyncOrderBy: LinearTicketSyncOrderByOption = linearTicketSyncOrderByOptions[0]
export const defaultLinearTicketSortOrder: LinearTicketSortOrderOption = linearTicketSortOrderOptions[0]

export function getLinearTicketSyncIntervalLabel(option: LinearTicketSyncIntervalOption) {
  switch (option) {
    case 'manual':
      return 'Manual'
    case '5m':
      return 'Every 5 minutes'
    case '15m':
      return 'Every 15 minutes'
    case '30m':
      return 'Every 30 minutes'
    case '1h':
      return 'Every hour'
  }
}

export function getLinearTicketSyncIntervalMilliseconds(option: LinearTicketSyncIntervalOption) {
  switch (option) {
    case 'manual':
      return false
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '30m':
      return 30 * 60_000
    case '1h':
      return 60 * 60_000
  }
}

export function getLinearTicketSyncOrderByLabel(option: LinearTicketSyncOrderByOption) {
  switch (option) {
    case PaginationOrderBy.CreatedAt:
      return 'Created date'
    case PaginationOrderBy.UpdatedAt:
      return 'Updated date'
  }
}

export function getLinearTicketSortOrderLabel(option: LinearTicketSortOrderOption) {
  switch (option) {
    case 'alphabetical':
      return 'Alphabetical'
    case 'created':
      return 'Created date'
    case 'custom':
      return 'Relevance'
    case 'status':
      return 'Status'
    case 'updated':
      return 'Updated date'
  }
}

export function normalizeLinearTicketSyncLimit(syncLimit: number) {
  if (!Number.isFinite(syncLimit)) {
    return defaultLinearTicketSyncLimit
  }

  return Math.max(1, Math.floor(syncLimit))
}
