import type { LinearTicketSortByOption } from '../services/storage/config'

import { QueryClient } from '@tanstack/react-query'

export type QueryKeySegments<T> = {
  params?: Partial<T>
  other?: unknown[]
}

type AssignedLinearTicketsQueryParams = {
  fetchLimit: number
  sortBy: LinearTicketSortByOption
}

function spreadQueryKeySegments(keys?: QueryKeySegments<unknown>) {
  return [...(keys?.params ? [keys.params] : []), ...(keys?.other ?? [])]
}

export const queryKeys = {
  clockify: {
    dashboardWidget: ['clockify', 'dashboard-widget'] as const,
    projectOptions: ['clockify', 'project-options'] as const,
    ticketTimeSummaries: (keys?: QueryKeySegments<unknown>) =>
      ['clockify', 'ticket-time-summaries', ...spreadQueryKeySegments(keys)] as const,
  },
  linear: {
    assignedTickets: (keys?: QueryKeySegments<AssignedLinearTicketsQueryParams>) =>
      ['linear', 'assigned-tickets', ...spreadQueryKeySegments(keys)] as const,
  },
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
