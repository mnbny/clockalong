import type { QueryFilters } from '@tanstack/react-query'

import { onlineManager } from '@tanstack/react-query'

import { queryClient, queryKeys } from '../lib/query-client'

const syncGroups: Array<QueryFilters & { name: string }> = [
  { name: 'Clockify entries', queryKey: queryKeys.clockify.entrySync(), type: 'active' },
  { name: 'Clockify running timer', queryKey: queryKeys.clockify.runningEntry(), type: 'all' },
  { name: 'Clockify summaries', queryKey: queryKeys.clockify.summaryReport(), type: 'all' },
  { name: 'Linear tickets', queryKey: queryKeys.linear.ticketSync(), type: 'active' },
  { name: 'GitHub work items', queryKey: queryKeys.github.workItemSync(), type: 'active' },
]

let pendingSync: ReturnType<typeof syncAllProviders> | undefined

export function syncProviders() {
  pendingSync ??= syncAllProviders().finally(() => {
    pendingSync = undefined
  })
  return pendingSync
}

async function syncAllProviders() {
  const groups = syncGroups.filter(group =>
    queryClient
      .getQueryCache()
      .findAll(group)
      .some(query => !query.isDisabled()),
  )
  const results = await Promise.allSettled(
    groups.map(async group => {
      if (!onlineManager.isOnline()) {
        throw new Error('Sync unavailable while offline')
      }
      const queries = queryClient
        .getQueryCache()
        .findAll(group)
        .filter(query => !query.isDisabled())
      // Paused requests wait for window focus. Explicit sync must also work while the app is hidden.
      await queryClient.cancelQueries({ ...group, predicate: query => query.state.fetchStatus === 'paused' })
      await queryClient.refetchQueries(group, { cancelRefetch: false })
      // TanStack resolves refetches on errors and when offline; neither is a successful sync.
      if (queries.some(query => query.state.status === 'error' || query.state.fetchStatus === 'paused')) {
        throw new Error('Sync failed or paused')
      }
    }),
  )
  const failures = groups.filter((_, index) => results[index].status === 'rejected')

  if (failures.length) {
    throw new Error(`Sync failed: ${failures.map(group => group.name).join(', ')}. Try refreshing again.`)
  }

  return { synced: groups.map(group => group.name) }
}
