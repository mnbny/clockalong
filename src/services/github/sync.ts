import type { RestEndpointMethodTypes } from '@octokit/rest'
import type { PropsWithChildren } from 'react'

import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'
import { useQuery } from '@tanstack/react-query'
import { createContext, createElement, useCallback, useContext, useMemo } from 'react'

import { useAppAuth } from '../../hooks/useAppAuth'
import { queryKeys } from '../../lib/query-client'
import {
  defaultGithubWorkItemSyncLimit,
  type GithubSelectedRepository,
  type GithubVisibleWorkItemTypes,
  maxGithubWorkItemSyncLimit,
} from '../storage/config'
import { useStorage } from '../storage/useStorage'
import { createGithubClient } from './client'

type GithubIssue = RestEndpointMethodTypes['issues']['listForRepo']['response']['data'][number]
type GithubPullRequest = RestEndpointMethodTypes['pulls']['list']['response']['data'][number]

const githubWorkItemSyncInterval = 30 * 60_000
const githubWorkItemsStorageKey = 'clockalong.github.workItems.v1'

export type GithubWorkItemType = 'issue' | 'pullRequest'

export type GithubIssueWorkItem = {
  author: string | null
  authorAvatarUrl: string | null
  id: string
  item: GithubIssue
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
  item: GithubPullRequest
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

export const githubWorkItemsCollection = createCollection(
  localStorageCollectionOptions<SyncedGithubWorkItem, string>({
    id: 'github-work-items',
    storageKey: githubWorkItemsStorageKey,
    getKey: item => item.id,
  }),
)

function useGithubSyncData() {
  const authState = useAppAuth()
  const [githubSelectedRepositories] = useStorage('githubSelectedRepositories')
  const [githubVisibleWorkItemTypes] = useStorage('githubVisibleWorkItemTypes')
  const [githubWorkItemSyncLimit] = useStorage('githubWorkItemSyncLimit')
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
  const syncQuery = useQuery({
    queryKey: queryKeys.github.workItemSync({
      params: {
        issues: githubVisibleWorkItemTypes.issues,
        limit: normalizedSyncLimit,
        pullRequests: githubVisibleWorkItemTypes.pullRequests,
        repositories: repositorySignature,
      },
    }),
    queryFn: () =>
      syncGithubWorkItems({
        repositories: githubSelectedRepositories,
        syncLimit: normalizedSyncLimit,
        visibleWorkItemTypes: githubVisibleWorkItemTypes,
      }),
    enabled: githubAuthenticated,
    refetchInterval: githubWorkItemSyncInterval,
    staleTime: 60_000,
  })
  const syncNow = useCallback(() => syncQuery.refetch(), [syncQuery])

  return {
    lastSyncResult: syncQuery.data ?? null,
    syncNow,
    queries: {
      syncQuery,
    },
    syncing: syncQuery.isFetching,
  }
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

export async function clearSyncedGithubWorkItems() {
  await githubWorkItemsCollection.preload()
  const itemIds = githubWorkItemsCollection.toArray.map(item => item.id)

  if (!itemIds.length) {
    return 0
  }

  const transaction = githubWorkItemsCollection.delete(itemIds)
  await transaction.isPersisted.promise
  return itemIds.length
}

async function syncGithubWorkItems({
  repositories,
  syncLimit,
  visibleWorkItemTypes,
}: GithubWorkItemSyncOptions): Promise<GithubWorkItemSyncResult> {
  const syncedAt = new Date().toISOString()
  const fetchedItemIds = new Set<string>()
  let issuesFetched = 0
  let itemsStored = 0
  let pullRequestsFetched = 0

  await githubWorkItemsCollection.preload()

  if (!repositories.length || (!visibleWorkItemTypes.issues && !visibleWorkItemTypes.pullRequests)) {
    const itemsDeleted = await deleteStaleSyncedGithubWorkItems({ fetchedItemIds, repositories, visibleWorkItemTypes })

    return {
      issuesFetched,
      itemsDeleted,
      itemsStored,
      pullRequestsFetched,
      repositoriesSynced: repositories.length,
    }
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

      for (const item of issueItems) {
        fetchedItemIds.add(item.id)
      }

      const upsertResult = await upsertSyncedGithubWorkItems(issueItems)

      issuesFetched += issueItems.length
      itemsStored += upsertResult.stored
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

      for (const item of pullRequestItems) {
        fetchedItemIds.add(item.id)
      }

      const upsertResult = await upsertSyncedGithubWorkItems(pullRequestItems)

      pullRequestsFetched += pullRequestItems.length
      itemsStored += upsertResult.stored
    }
  }

  const itemsDeleted = await deleteStaleSyncedGithubWorkItems({ fetchedItemIds, repositories, visibleWorkItemTypes })

  return {
    issuesFetched,
    itemsDeleted,
    itemsStored,
    pullRequestsFetched,
    repositoriesSynced: repositories.length,
  }
}

function toSyncedGithubIssue({
  issue,
  repository,
  syncedAt,
}: {
  issue: GithubIssue
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
      item: issue,
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
  pullRequest,
  repository,
  syncedAt,
}: {
  pullRequest: GithubPullRequest
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
      item: pullRequest,
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

async function upsertSyncedGithubWorkItems(items: SyncedGithubWorkItem[]) {
  let stored = 0

  for (const item of items) {
    const transaction = githubWorkItemsCollection.has(item.id)
      ? githubWorkItemsCollection.update(item.id, draft => {
          Object.assign(draft, item)
        })
      : githubWorkItemsCollection.insert(item)

    await transaction.isPersisted.promise
    stored += 1
  }

  return { stored }
}

async function deleteStaleSyncedGithubWorkItems({
  fetchedItemIds,
  repositories,
  visibleWorkItemTypes,
}: {
  fetchedItemIds: Set<string>
  repositories: GithubSelectedRepository[]
  visibleWorkItemTypes: GithubVisibleWorkItemTypes
}) {
  const repositoryFullNames = new Set(repositories.map(repository => repository.fullName))
  const visibleTypes = new Set<GithubWorkItemType>([
    ...(visibleWorkItemTypes.issues ? (['issue'] as const) : []),
    ...(visibleWorkItemTypes.pullRequests ? (['pullRequest'] as const) : []),
  ])
  const staleIds = githubWorkItemsCollection.toArray
    .filter(
      item =>
        !repositoryFullNames.has(item.repositoryFullName) ||
        !visibleTypes.has(item.type) ||
        !fetchedItemIds.has(item.id),
    )
    .map(item => item.id)

  if (!staleIds.length) {
    return 0
  }

  const transaction = githubWorkItemsCollection.delete(staleIds)
  await transaction.isPersisted.promise
  return staleIds.length
}

function getGithubWorkItemId(repositoryFullName: string, type: GithubWorkItemType, number: number) {
  return `${repositoryFullName}:${type}:${number}`
}

function normalizeGithubWorkItemSyncLimit(syncLimit: number) {
  if (!Number.isFinite(syncLimit)) {
    return defaultGithubWorkItemSyncLimit
  }

  return Math.min(maxGithubWorkItemSyncLimit, Math.max(1, Math.floor(syncLimit)))
}
