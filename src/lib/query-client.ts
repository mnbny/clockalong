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

type ClockifyProjectsQueryParams = {
  workspaceId?: string
}

type ClockifyRunningEntryQueryParams = {
  userId?: string
  workspaceId?: string
}

type ClockifySummaryReportQueryParams = {
  period?: string
  userId?: string
  workspaceId?: string
}

type ClockifyTimeEntriesQueryParams = {
  end?: string
  start?: string
  userId?: string
  workspaceId?: string
}

function spreadQueryKeySegments(keys?: QueryKeySegments<unknown>) {
  return [...(keys?.params ? [keys.params] : []), ...(keys?.other ?? [])]
}

export const queryKeys = {
  clockify: {
    loggedUser: ['clockify', 'logged-user'] as const,
    projects: (keys?: QueryKeySegments<ClockifyProjectsQueryParams>) =>
      ['clockify', 'projects', ...spreadQueryKeySegments(keys)] as const,
    runningEntry: (keys?: QueryKeySegments<ClockifyRunningEntryQueryParams>) =>
      ['clockify', 'running-entry', ...spreadQueryKeySegments(keys)] as const,
    summaryReport: (keys?: QueryKeySegments<ClockifySummaryReportQueryParams>) =>
      ['clockify', 'summary-report', ...spreadQueryKeySegments(keys)] as const,
    timeEntries: (keys?: QueryKeySegments<ClockifyTimeEntriesQueryParams>) =>
      ['clockify', 'time-entries', ...spreadQueryKeySegments(keys)] as const,
    workspaces: ['clockify', 'workspaces'] as const,
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
