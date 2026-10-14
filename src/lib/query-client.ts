import type { LinearTicketSyncOrderByOption } from '../services/linear/ticket-settings'

import { QueryClient } from '@tanstack/react-query'

export type QueryKeySegments<T> = {
  params?: Partial<T>
  other?: unknown[]
}

type LinearTicketSyncQueryParams = {
  orderBy: LinearTicketSyncOrderByOption
  syncLimit: number
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

type GithubRepositoryQueryParams = {
  owner?: string
  repo?: string
}

type GithubWorkItemSyncQueryParams = {
  issues: boolean
  limit: number
  pullRequests: boolean
  repositories: string
}

function spreadQueryKeySegments(keys?: QueryKeySegments<unknown>) {
  return [...(keys?.params ? [keys.params] : []), ...(keys?.other ?? [])]
}

export const queryKeys = {
  telegram: {
    all: ['telegram'] as const,
    summary: (keys?: QueryKeySegments<unknown>) => ['telegram', 'summary', ...spreadQueryKeySegments(keys)] as const,
    topics: (keys?: QueryKeySegments<unknown>) => ['telegram', 'topics', ...spreadQueryKeySegments(keys)] as const,
    history: (keys?: QueryKeySegments<{ topicId: number | null }>) =>
      ['telegram', 'history', ...spreadQueryKeySegments(keys)] as const,
    avatar: (keys?: QueryKeySegments<{ senderId: string; photoId: string; size: 'small' }>) =>
      ['telegram', 'avatar', ...spreadQueryKeySegments(keys)] as const,
    attachment: (keys?: QueryKeySegments<unknown>) =>
      ['telegram', 'attachment', ...spreadQueryKeySegments(keys)] as const,
    send: (keys?: QueryKeySegments<unknown>) => ['telegram', 'send', ...spreadQueryKeySegments(keys)] as const,
    read: (keys?: QueryKeySegments<unknown>) => ['telegram', 'read', ...spreadQueryKeySegments(keys)] as const,
  },
  clockify: {
    all: ['clockify'] as const,
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
  github: {
    all: ['github'] as const,
    repositoryLabels: (keys?: QueryKeySegments<GithubRepositoryQueryParams>) =>
      ['github', 'repository-labels', ...spreadQueryKeySegments(keys)] as const,
    repositories: ['github', 'repositories'] as const,
    repositoryIssues: (keys?: QueryKeySegments<GithubRepositoryQueryParams>) =>
      ['github', 'repository-issues', ...spreadQueryKeySegments(keys)] as const,
    repositoryPullRequests: (keys?: QueryKeySegments<GithubRepositoryQueryParams>) =>
      ['github', 'repository-pull-requests', ...spreadQueryKeySegments(keys)] as const,
    viewer: ['github', 'viewer'] as const,
    workItemSync: (keys?: QueryKeySegments<GithubWorkItemSyncQueryParams>) =>
      ['github', 'work-item-sync', ...spreadQueryKeySegments(keys)] as const,
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
