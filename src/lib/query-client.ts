import type { LinearTicketSortByOption } from '../services/linear/ticket-settings'

import { QueryClient } from '@tanstack/react-query'

export type QueryKeySegments<T> = {
  params?: Partial<T>
  other?: unknown[]
}

type LinearTicketSyncQueryParams = {
  syncLimit: number
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

type ClockifyEntrySyncQueryParams = {
  userId?: string
  workspaceId?: string
}

function spreadQueryKeySegments(keys?: QueryKeySegments<unknown>) {
  return [...(keys?.params ? [keys.params] : []), ...(keys?.other ?? [])]
}

export const queryKeys = {
  clockify: {
    entrySync: (keys?: QueryKeySegments<ClockifyEntrySyncQueryParams>) =>
      ['clockify', 'entry-sync', ...spreadQueryKeySegments(keys)] as const,
    loggedUser: ['clockify', 'logged-user'] as const,
    projects: (keys?: QueryKeySegments<ClockifyProjectsQueryParams>) =>
      ['clockify', 'projects', ...spreadQueryKeySegments(keys)] as const,
    runningEntry: (keys?: QueryKeySegments<ClockifyRunningEntryQueryParams>) =>
      ['clockify', 'running-entry', ...spreadQueryKeySegments(keys)] as const,
    summaryReport: (keys?: QueryKeySegments<ClockifySummaryReportQueryParams>) =>
      ['clockify', 'summary-report', ...spreadQueryKeySegments(keys)] as const,
    workspaces: ['clockify', 'workspaces'] as const,
  },
  linear: {
    ticketSync: (keys?: QueryKeySegments<LinearTicketSyncQueryParams>) =>
      ['linear', 'ticket-sync', ...spreadQueryKeySegments(keys)] as const,
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
