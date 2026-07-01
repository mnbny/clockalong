import { PaginationOrderBy } from '@linear/sdk'

export const linearTicketsPageSize = 50
export const defaultLinearTicketFetchLimit = linearTicketsPageSize
export const linearTicketRefetchIntervalOptions = ['manual', '5m', '15m', '30m', '1h'] as const
export const linearTicketSortByOptions = [PaginationOrderBy.CreatedAt, PaginationOrderBy.UpdatedAt] as const
export const linearTicketSortOrderOptions = ['custom', 'status', 'created', 'updated', 'alphabetical'] as const

export type LinearTicketRefetchIntervalOption = (typeof linearTicketRefetchIntervalOptions)[number]
export type LinearTicketSortByOption = (typeof linearTicketSortByOptions)[number]
export type LinearTicketSortOrderOption = (typeof linearTicketSortOrderOptions)[number]

export const defaultLinearTicketRefetchInterval: LinearTicketRefetchIntervalOption = '30m'
export const defaultLinearTicketSortBy: LinearTicketSortByOption = linearTicketSortByOptions[0]
export const defaultLinearTicketSortOrder: LinearTicketSortOrderOption = linearTicketSortOrderOptions[0]

export function getLinearTicketRefetchIntervalLabel(option: LinearTicketRefetchIntervalOption) {
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

export function getLinearTicketRefetchIntervalMilliseconds(option: LinearTicketRefetchIntervalOption) {
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

export function getLinearTicketSortByLabel(option: LinearTicketSortByOption) {
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
      return 'Clinear relevance'
    case 'status':
      return 'Status'
    case 'updated':
      return 'Updated date'
  }
}

export function normalizeLinearTicketFetchLimit(fetchLimit: number) {
  if (!Number.isFinite(fetchLimit)) {
    return defaultLinearTicketFetchLimit
  }

  return Math.max(1, Math.floor(fetchLimit))
}
