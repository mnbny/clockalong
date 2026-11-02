import type { RestEndpointMethodTypes } from '@octokit/rest'
import type { PropsWithChildren } from 'react'

import { queryOptions, useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useEffect, useMemo } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import { getErrorMessage } from '../../utils/errors'
import { pick } from '../../utils/objects'
import {
  defaultGithubWorkItemSyncLimit,
  type GithubSelectedRepository,
  type GithubVisibleWorkItemTypes,
  maxGithubWorkItemSyncLimit,
} from '../storage/config'
import { useStorage } from '../storage/useStorage'
import { createGithubClient } from './client'
import { getGithubWorkItemSyncIntervalMilliseconds, type GithubWorkItemSyncIntervalOption } from './sync-settings'
import { githubWorkItemCache } from './work-item-cache'

type GithubIssue = RestEndpointMethodTypes['issues']['listForRepo']['response']['data'][number]
type GithubMentionedIssue = RestEndpointMethodTypes['issues']['listForAuthenticatedUser']['response']['data'][number]
type GithubPullRequest = RestEndpointMethodTypes['pulls']['list']['response']['data'][number]
type GithubPullRequestDetails = RestEndpointMethodTypes['pulls']['get']['response']['data']
type GithubIssueData = GithubIssue | GithubMentionedIssue
type GithubPullRequestData = GithubPullRequest | GithubPullRequestDetails

const storedGithubIssueItemFields = ['labels'] as const satisfies ReadonlyArray<keyof GithubIssueData>
const storedGithubPullRequestItemFields = ['labels'] as const satisfies ReadonlyArray<keyof GithubPullRequestData>

type StoredGithubIssueItem = Pick<GithubIssueData, (typeof storedGithubIssueItemFields)[number]>
type StoredGithubPullRequestItem = Pick<GithubPullRequestData, (typeof storedGithubPullRequestItemFields)[number]>

export type GithubWorkItemType = 'issue' | 'pullRequest'
export type GithubWorkItemInvolvementReason = 'mentioned' | 'reviewRequested'

export type GithubIssueWorkItem = {
  author: string | null
  authorAvatarUrl: string | null
  id: string
  involvementReasons?: GithubWorkItemInvolvementReason[]
  item: StoredGithubIssueItem
  number: number
  repositoryFullName: string
  repositoryOwner: string
  repositoryUrl: string
  state: string
  syncedAt: string
  title: string
  type: 'issue'
  updatedAt: string
  url: string
}

export type GithubPullRequestWorkItem = {
  author: string | null
  authorAvatarUrl: string | null
  baseBranch: string
  headBranch: string
  id: string
  involvementReasons?: GithubWorkItemInvolvementReason[]
  item: StoredGithubPullRequestItem
  number: number
  repositoryFullName: string
  repositoryOwner: string
  repositoryUrl: string
  state: string
  syncedAt: string
  title: string
  type: 'pullRequest'
  updatedAt: string
  url: string
}

export type SyncedGithubWorkItem = GithubIssueWorkItem | GithubPullRequestWorkItem

type GithubWorkItemSyncOptions = {
  repositories: GithubSelectedRepository[]
  syncLimit: number
  visibleWorkItemTypes: GithubVisibleWorkItemTypes
}

type GithubWorkItemSyncResult = {
  issuesFetched: number
  itemsDeleted: number
  itemsStored: number
  pullRequestsFetched: number
  repositoriesSynced: number
}

export const prepareGithubWorkItems = githubWorkItemCache.ready

function useGithubSyncData() {
  const authState = useAppAuth()
  const cacheQuery = useQuery(githubWorkItemCacheQueryOptions())
  const [githubSelectedRepositories] = useStorage('githubSelectedRepositories')
  const [githubVisibleWorkItemTypes] = useStorage('githubVisibleWorkItemTypes')
  const [githubWorkItemSyncLimit] = useStorage('githubWorkItemSyncLimit')
  const [githubWorkItemSyncInterval] = useStorage('githubWorkItemSyncInterval')
  const githubAuthenticated = authState.value.githubAuthenticated && !authState.loading
  const normalizedSyncLimit = normalizeGithubWorkItemSyncLimit(githubWorkItemSyncLimit)
  const repositorySignature = useMemo(
    () =>
      githubSelectedRepositories
        .map(repository => repository.fullName)
        .sort()
        .join('|'),
    [githubSelectedRepositories],
  )
  const syncQuery = useQuery(
    githubWorkItemSyncQueryOptions({
      enabled: githubAuthenticated,
      interval: githubWorkItemSyncInterval,
      repositories: githubSelectedRepositories,
      repositorySignature,
      syncLimit: normalizedSyncLimit,
      visibleWorkItemTypes: githubVisibleWorkItemTypes,
    }),
  )
  useEffect(() => {
    if (syncQuery.isSuccess && cacheQuery.isError) void cacheQuery.refetch()
  }, [cacheQuery.isError, cacheQuery.refetch, syncQuery.isSuccess])
  const syncNow = useCallback(() => {
    if (cacheQuery.isError) void cacheQuery.refetch()
    return syncQuery.refetch()
  }, [cacheQuery, syncQuery])

  return {
    lastSyncResult: syncQuery.data ?? null,
    syncNow,
    queries: {
      cacheQuery,
      syncQuery,
    },
    syncing: syncQuery.isFetching,
  }
}

export function githubWorkItemCacheQueryOptions(cache = githubWorkItemCache) {
  return queryOptions({
    queryKey: queryKeys.github.workItemCache(cache.database.name),
    queryFn: async () => {
      await cache.ready()
      return true
    },
    networkMode: 'always',
    retry: false,
    staleTime: Infinity,
  })
}

export function githubWorkItemSyncQueryOptions({
  enabled,
  interval,
  repositories,
  repositorySignature,
  syncLimit,
  visibleWorkItemTypes,
}: GithubWorkItemSyncOptions & {
  enabled: boolean
  interval: GithubWorkItemSyncIntervalOption
  repositorySignature: string
}) {
  return queryOptions({
    queryKey: queryKeys.github.workItemSync({
      params: {
        issues: visibleWorkItemTypes.issues,
        limit: syncLimit,
        pullRequests: visibleWorkItemTypes.pullRequests,
        repositories: repositorySignature,
      },
    }),
    queryFn: () =>
      syncGithubWorkItems({
        repositories,
        syncLimit,
        visibleWorkItemTypes,
      }),
    enabled,
    refetchInterval: getGithubWorkItemSyncIntervalMilliseconds(interval),
    staleTime: 60_000,
  })
}

type GithubSyncContext = ReturnType<typeof useGithubSyncData>
const GithubSyncContext = createContext<GithubSyncContext | null>(null)

export function GithubSyncProvider(props: PropsWithChildren) {
  const data = useGithubSyncData()

  return createElement(GithubSyncContext.Provider, { value: data }, props.children)
}

export function useGithubSync() {
  const context = useContext(GithubSyncContext)
  if (!context) throw new Error('useGithubSync must be used within a GithubSyncProvider')
  return context
}

export const clearSyncedGithubWorkItems = githubWorkItemCache.clear

async function syncGithubWorkItems({ repositories, syncLimit, visibleWorkItemTypes }: GithubWorkItemSyncOptions) {
  const syncedAt = new Date().toISOString()
  const syncGeneration = githubWorkItemCache.beginSync()
  const scope = { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes }
  const syncedWorkItemsById = new Map<string, SyncedGithubWorkItem>()
  let issuesFetched = 0
  let itemsStored = 0
  let pullRequestsFetched = 0

  githubSyncLog('work item sync start', {
    repositories: repositories.map(repository => repository.fullName),
    syncLimit,
    visibleWorkItemTypes,
  })
  try {
    await prepareGithubWorkItems()
    if (!repositories.length || (!visibleWorkItemTypes.issues && !visibleWorkItemTypes.pullRequests)) {
      const persistenceResult = await githubWorkItemCache.replace([], syncGeneration, scope)
      const emptyResult = {
        issuesFetched,
        itemsDeleted: persistenceResult.deleted,
        itemsStored,
        pullRequestsFetched,
        repositoriesSynced: repositories.length,
      } satisfies GithubWorkItemSyncResult

      githubSyncLog('work item sync complete', emptyResult)

      return emptyResult
    }

    const github = await createGithubClient()

    for (const repository of repositories) {
      if (visibleWorkItemTypes.issues) {
        const issuesResponse = await github.rest.issues.listForRepo({
          direction: 'desc',
          owner: repository.owner,
          per_page: syncLimit,
          repo: repository.name,
          sort: 'updated',
          state: 'open',
        })
        const issueItems = issuesResponse.data.flatMap(issue => toSyncedGithubIssue({ issue, repository, syncedAt }))

        issuesFetched += issueItems.length
        addGithubWorkItems(syncedWorkItemsById, issueItems)
      }

      if (visibleWorkItemTypes.pullRequests) {
        const openPullRequestsResponse = await github.rest.pulls.list({
          direction: 'desc',
          owner: repository.owner,
          per_page: syncLimit,
          repo: repository.name,
          sort: 'updated',
          state: 'open',
        })
        const closedPullRequestsResponse = await github.rest.pulls.list({
          direction: 'desc',
          owner: repository.owner,
          per_page: syncLimit,
          repo: repository.name,
          sort: 'updated',
          state: 'closed',
        })
        const pullRequestItems = [...openPullRequestsResponse.data, ...closedPullRequestsResponse.data].flatMap(
          pullRequest => toSyncedGithubPullRequest({ pullRequest, repository, syncedAt }),
        )

        pullRequestsFetched += pullRequestItems.length
        addGithubWorkItems(syncedWorkItemsById, pullRequestItems)
      }
    }

    await syncGithubMentionedWorkItems({
      github,
      repositories,
      syncLimit,
      syncedAt,
      syncedWorkItemsById,
      visibleWorkItemTypes,
    })
    await syncGithubReviewRequestWorkItems({
      github,
      repositories,
      syncLimit,
      syncedAt,
      syncedWorkItemsById,
      visibleWorkItemTypes,
    })

    const syncedWorkItems = [...syncedWorkItemsById.values()]

    const upsertResult = await githubWorkItemCache.replace(syncedWorkItems, syncGeneration, scope)
    itemsStored += upsertResult.stored

    const result = {
      issuesFetched,
      itemsDeleted: upsertResult.deleted,
      itemsStored,
      pullRequestsFetched,
      repositoriesSynced: repositories.length,
    } satisfies GithubWorkItemSyncResult

    githubSyncLog('work item sync complete', result)

    return result
  } catch (error) {
    githubSyncLog('work item sync failed', {
      error: getErrorMessage(error),
      repositories: repositories.map(repository => repository.fullName),
      database: githubWorkItemCache.database.name,
    })
    throw error
  }
}

async function syncGithubMentionedWorkItems({
  github,
  repositories,
  syncLimit,
  syncedAt,
  syncedWorkItemsById,
  visibleWorkItemTypes,
}: {
  github: Awaited<ReturnType<typeof createGithubClient>>
  repositories: GithubSelectedRepository[]
  syncLimit: number
  syncedAt: string
  syncedWorkItemsById: Map<string, SyncedGithubWorkItem>
  visibleWorkItemTypes: GithubVisibleWorkItemTypes
}) {
  const repositoriesByFullName = new Map(repositories.map(repository => [repository.fullName, repository]))
  const response = await github.rest.issues.listForAuthenticatedUser({
    direction: 'desc',
    filter: 'mentioned',
    per_page: syncLimit,
    sort: 'updated',
    state: 'open',
  })

  for (const issue of response.data) {
    const repository = issue.repository?.full_name ? repositoriesByFullName.get(issue.repository.full_name) : undefined

    if (!repository) {
      continue
    }

    if (issue.pull_request) {
      if (!visibleWorkItemTypes.pullRequests) {
        continue
      }

      await addGithubRelevantPullRequest({
        github,
        involvementReason: 'mentioned',
        number: issue.number,
        repository,
        syncedAt,
        syncedWorkItemsById,
      })
      continue
    }

    if (!visibleWorkItemTypes.issues) {
      continue
    }

    addGithubWorkItems(
      syncedWorkItemsById,
      toSyncedGithubIssue({
        involvementReasons: ['mentioned'],
        issue,
        repository,
        syncedAt,
      }),
    )
  }
}

async function syncGithubReviewRequestWorkItems({
  github,
  repositories,
  syncLimit,
  syncedAt,
  syncedWorkItemsById,
  visibleWorkItemTypes,
}: {
  github: Awaited<ReturnType<typeof createGithubClient>>
  repositories: GithubSelectedRepository[]
  syncLimit: number
  syncedAt: string
  syncedWorkItemsById: Map<string, SyncedGithubWorkItem>
  visibleWorkItemTypes: GithubVisibleWorkItemTypes
}) {
  if (!visibleWorkItemTypes.pullRequests) {
    return
  }

  for (const repository of repositories) {
    const response = await github.rest.search.issuesAndPullRequests({
      order: 'desc',
      per_page: syncLimit,
      q: `repo:${repository.fullName} is:open is:pr user-review-requested:@me`,
      sort: 'updated',
    })

    for (const pullRequest of response.data.items) {
      await addGithubRelevantPullRequest({
        github,
        involvementReason: 'reviewRequested',
        number: pullRequest.number,
        repository,
        syncedAt,
        syncedWorkItemsById,
      })
    }
  }
}

async function addGithubRelevantPullRequest({
  github,
  involvementReason,
  number,
  repository,
  syncedAt,
  syncedWorkItemsById,
}: {
  github: Awaited<ReturnType<typeof createGithubClient>>
  involvementReason: GithubWorkItemInvolvementReason
  number: number
  repository: GithubSelectedRepository
  syncedAt: string
  syncedWorkItemsById: Map<string, SyncedGithubWorkItem>
}) {
  const id = getGithubWorkItemId(repository.fullName, 'pullRequest', number)
  const existingItem = syncedWorkItemsById.get(id)

  if (existingItem) {
    syncedWorkItemsById.set(id, {
      ...existingItem,
      involvementReasons: mergeGithubWorkItemInvolvementReasons(existingItem.involvementReasons, [involvementReason]),
    })
    return
  }

  const response = await github.rest.pulls.get({
    owner: repository.owner,
    pull_number: number,
    repo: repository.name,
  })
  const pullRequestItem = toSyncedGithubPullRequest({
    involvementReasons: [involvementReason],
    pullRequest: response.data,
    repository,
    syncedAt,
  })

  addGithubWorkItems(syncedWorkItemsById, pullRequestItem)
}

function addGithubWorkItems(syncedWorkItemsById: Map<string, SyncedGithubWorkItem>, items: SyncedGithubWorkItem[]) {
  for (const item of items) {
    const existingItem = syncedWorkItemsById.get(item.id)

    syncedWorkItemsById.set(
      item.id,
      existingItem
        ? {
            ...item,
            involvementReasons: mergeGithubWorkItemInvolvementReasons(
              existingItem.involvementReasons,
              item.involvementReasons,
            ),
          }
        : item,
    )
  }
}

function mergeGithubWorkItemInvolvementReasons(...reasonGroups: Array<GithubWorkItemInvolvementReason[] | undefined>) {
  const reasons = new Set(reasonGroups.flatMap(reasonGroup => reasonGroup ?? []))

  return (['reviewRequested', 'mentioned'] as const).filter(reason => reasons.has(reason))
}

function toSyncedGithubIssue({
  involvementReasons = [],
  issue,
  repository,
  syncedAt,
}: {
  involvementReasons?: GithubWorkItemInvolvementReason[]
  issue: GithubIssueData
  repository: GithubSelectedRepository
  syncedAt: string
}): SyncedGithubWorkItem[] {
  if (issue.pull_request) {
    return []
  }

  return [
    {
      author: issue.user?.login ?? null,
      authorAvatarUrl: issue.user?.avatar_url ?? null,
      id: getGithubWorkItemId(repository.fullName, 'issue', issue.number),
      involvementReasons,
      item: pick(issue, ...storedGithubIssueItemFields),
      number: issue.number,
      repositoryFullName: repository.fullName,
      repositoryOwner: repository.owner,
      repositoryUrl: repository.url,
      state: issue.state,
      syncedAt,
      title: issue.title,
      type: 'issue',
      updatedAt: issue.updated_at,
      url: issue.html_url,
    },
  ]
}

function toSyncedGithubPullRequest({
  involvementReasons = [],
  pullRequest,
  repository,
  syncedAt,
}: {
  involvementReasons?: GithubWorkItemInvolvementReason[]
  pullRequest: GithubPullRequestData
  repository: GithubSelectedRepository
  syncedAt: string
}): SyncedGithubWorkItem[] {
  return [
    {
      author: pullRequest.user?.login ?? null,
      authorAvatarUrl: pullRequest.user?.avatar_url ?? null,
      baseBranch: pullRequest.base.ref,
      headBranch: pullRequest.head.ref,
      id: getGithubWorkItemId(repository.fullName, 'pullRequest', pullRequest.number),
      involvementReasons,
      item: pick(pullRequest, ...storedGithubPullRequestItemFields),
      number: pullRequest.number,
      repositoryFullName: repository.fullName,
      repositoryOwner: repository.owner,
      repositoryUrl: repository.url,
      state: pullRequest.state,
      syncedAt,
      title: pullRequest.title,
      type: 'pullRequest',
      updatedAt: pullRequest.updated_at,
      url: pullRequest.html_url,
    },
  ]
}

function getGithubWorkItemId(repositoryFullName: string, type: GithubWorkItemType, number: number) {
  return `${repositoryFullName}:${type}:${number}`
}

function githubSyncLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[github sync] ${message}`)
    return
  }

  console.info(`[github sync] ${message}`, details)
}

function normalizeGithubWorkItemSyncLimit(syncLimit: number) {
  if (!Number.isFinite(syncLimit)) {
    return defaultGithubWorkItemSyncLimit
  }

  return Math.min(maxGithubWorkItemSyncLimit, Math.max(1, Math.floor(syncLimit)))
}
