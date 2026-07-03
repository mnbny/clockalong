import type { TimeEntryWithRatesDtoV1 } from '../clockify/generated/clockify'
import type { SyncedGithubWorkItem } from './sync'

import { formatInternalRef } from '../../utils/templates'
import {
  type ClockifyWorkItemTimeSummaries,
  getClockifyEntryWorkItem,
  summarizeClockifyWorkItemTimeEntries,
} from '../clockify/work-item-summaries'

export type GithubWorkItemWithTracking = SyncedGithubWorkItem & {
  lastTrackedAt: string | null
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number | null
}

export function summarizeClockifyGithubWorkItemTimeEntries({
  entries,
  now,
  workItems,
}: {
  entries: TimeEntryWithRatesDtoV1[]
  now?: Date
  workItems: SyncedGithubWorkItem[]
}) {
  return summarizeClockifyWorkItemTimeEntries({
    entries,
    getWorkItemId: workItem => workItem.id,
    getWorkItemInternalRef: getGithubWorkItemInternalRef,
    now,
    workItems,
  })
}

export function getClockifyEntryGithubWorkItem(
  entry: TimeEntryWithRatesDtoV1 | null,
  workItems: SyncedGithubWorkItem[],
) {
  return getClockifyEntryWorkItem({
    entry,
    getWorkItemInternalRef: getGithubWorkItemInternalRef,
    workItems,
  })
}

export function getGithubWorkItemInternalRef(workItem: SyncedGithubWorkItem) {
  return formatInternalRef({
    itemType: workItem.type === 'pullRequest' ? 'pr' : 'issue',
    number: workItem.number,
    provider: 'github',
    repository: workItem.repositoryFullName,
  })
}

export function mergeGithubWorkItemTimeSummaries(
  workItems: SyncedGithubWorkItem[],
  timeSummaries: ClockifyWorkItemTimeSummaries,
): GithubWorkItemWithTracking[] {
  return workItems.map(workItem => {
    const summary = timeSummaries[workItem.id]

    if (!summary) {
      return {
        ...workItem,
        lastTrackedAt: null,
        totalTrackedAmount: null,
        totalTrackedAmountCurrency: null,
        totalTrackedSeconds: null,
      }
    }

    return {
      ...workItem,
      lastTrackedAt: summary.lastTrackedAt,
      totalTrackedAmount: summary.totalTrackedAmount,
      totalTrackedAmountCurrency: summary.totalTrackedAmountCurrency,
      totalTrackedSeconds: summary.totalTrackedSeconds,
    }
  })
}
