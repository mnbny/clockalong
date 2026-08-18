import type { SyncedGithubWorkItem } from './sync'

import { internalRefTemplateToken } from '../../utils/templates'
import { clockify } from '../clockify/client'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../clockify/generated/clockify'
import {
  formatGithubIssueDescriptionTemplate,
  formatGithubPullRequestDescriptionTemplate,
  type GithubIssueDescriptionTemplateValues,
  type GithubPullRequestDescriptionTemplateValues,
} from './description-template'
import { getGithubWorkItemInternalRef } from './work-item-summaries'

export function formatGithubWorkItemDescription({
  issueTemplate,
  issueTemplateFallback,
  item,
  pullRequestTemplate,
  pullRequestTemplateFallback,
}: {
  issueTemplate: string
  issueTemplateFallback: string
  item: SyncedGithubWorkItem
  pullRequestTemplate: string
  pullRequestTemplateFallback: string
}) {
  if (item.type === 'issue') {
    const values = getGithubIssueDescriptionValues(item)

    return formatGithubIssueDescriptionTemplate(issueTemplate, values, { fallback: issueTemplateFallback })
  }

  const values = getGithubPullRequestDescriptionValues(item)

  return formatGithubPullRequestDescriptionTemplate(pullRequestTemplate, values, {
    fallback: pullRequestTemplateFallback,
  })
}

export function getGithubIssueDescriptionValues(item: Extract<SyncedGithubWorkItem, { type: 'issue' }>) {
  return {
    author: item.author,
    [internalRefTemplateToken]: getGithubWorkItemInternalRef(item),
    number: item.number,
    owner: item.repositoryOwner,
    repository: item.repositoryFullName,
    state: item.state,
    title: item.title,
    url: item.url,
  } satisfies GithubIssueDescriptionTemplateValues
}

export function getGithubPullRequestDescriptionValues(item: Extract<SyncedGithubWorkItem, { type: 'pullRequest' }>) {
  return {
    author: item.author,
    baseBranch: item.baseBranch,
    headBranch: item.headBranch,
    [internalRefTemplateToken]: getGithubWorkItemInternalRef(item),
    number: item.number,
    owner: item.repositoryOwner,
    repository: item.repositoryFullName,
    state: item.state,
    title: item.title,
    url: item.url,
  } satisfies GithubPullRequestDescriptionTemplateValues
}

export async function startClockifyTimerForGithubWorkItem({
  billable,
  description,
  item,
  projectId,
  workspaceId,
}: {
  billable: boolean
  description: string
  item: SyncedGithubWorkItem
  projectId: string
  workspaceId: string
}): Promise<TimeEntryDtoImplV1> {
  const body = {
    billable,
    description,
    projectId,
    start: new Date().toISOString(),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest

  githubTimerLog('create time entry request', {
    billable,
    descriptionLength: body.description.length,
    itemId: item.id,
    projectId,
    urlPresent: Boolean(item.url),
    workspaceId,
  })

  return clockify.createTimeEntry(body, { params: { workspaceId } })
}

export async function stopClockifyTimerForEntry({
  entry,
  item,
}: {
  entry: TimeEntryDtoImplV1
  item: SyncedGithubWorkItem
}): Promise<TimeEntryDtoImplV1> {
  if (!entry.userId || !entry.workspaceId) {
    throw new Error('Running Clockify timer is missing user or workspace information.')
  }

  githubTimerLog('stop time entry request', {
    clockifyEntryId: entry.id,
    itemId: item.id,
    userId: entry.userId,
    workspaceId: entry.workspaceId,
  })

  return clockify.stopRunningTimeEntry(
    { end: new Date().toISOString() },
    { params: { userId: entry.userId, workspaceId: entry.workspaceId } },
  )
}

function githubTimerLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[github api] timer ${message}`)
    return
  }

  console.info(`[github api] timer ${message}`, details)
}
