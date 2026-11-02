import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'
import type { SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { expect, test } from 'vitest'

import { queryClockifySummaries } from '../../../src/services/clockify/entry-queries'
import { DB } from '../../../src/services/db'
import { formatGithubWorkItemDescription } from '../../../src/services/github/timers'
import {
  getClockifyEntryGithubWorkItem,
  getGithubWorkItemInternalRef,
} from '../../../src/services/github/work-item-summaries'
import { buildGithubWorkRows, buildMcpSnapshot } from '../../../src/services/mcp/snapshot'

const common = {
  author: null,
  authorAvatarUrl: null,
  item: { labels: [] },
  number: 7,
  repositoryFullName: 'owner/repo',
  repositoryOwner: 'owner',
  repositoryUrl: 'https://github.com/owner/repo',
  state: 'open',
  syncedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  url: 'https://github.com/owner/repo/issues/7',
}
const issue: SyncedGithubWorkItem = { ...common, id: 'owner/repo:issue:7', title: 'Issue', type: 'issue' }
const pullRequest: SyncedGithubWorkItem = {
  ...common,
  id: 'owner/repo:pullRequest:7',
  title: 'PR',
  type: 'pullRequest',
  baseBranch: 'main',
  headBranch: 'feature',
}

test('issue and PR templates, running matches, summaries and MCP rows keep distinct identities', async () => {
  const options = {
    issueTemplate: 'Issue {number} {author} [{internal-ref}]',
    issueTemplateFallback: 'unknown',
    pullRequestTemplate: 'PR {number} ({headBranch} -> {baseBranch}) [{internal-ref}]',
    pullRequestTemplateFallback: 'unknown',
  }
  const issueDescription = formatGithubWorkItemDescription({ ...options, item: issue })
  const prDescription = formatGithubWorkItemDescription({ ...options, item: pullRequest })
  expect(issueDescription).toBe('Issue 7 unknown [ref:github:owner/repo:issue:7]')
  expect(prDescription).toBe('PR 7 (feature -> main) [ref:github:owner/repo:pr:7]')
  const running: TimeEntryWithRatesDtoV1 = {
    id: 'running',
    description: prDescription,
    timeInterval: { start: '2026-01-01T00:00:00Z' },
  }
  const now = new Date('2026-01-01T00:10:00Z')
  expect(getClockifyEntryGithubWorkItem(running, [issue, pullRequest])?.id).toBe(pullRequest.id)
  const db = new DB(`github-tracking-${crypto.randomUUID()}`)
  let summaries
  try {
    summaries = await queryClockifySummaries(
      db,
      { userId: 'user', workspaceId: 'workspace' },
      [issue, pullRequest],
      item => item.id,
      getGithubWorkItemInternalRef,
      [running, running],
      now,
    )
  } finally {
    db.close()
    await db.delete()
  }
  expect(summaries).toMatchObject({ [pullRequest.id]: { totalTrackedSeconds: 600 } })
  const snapshot = buildMcpSnapshot({
    clockifyConnected: true,
    githubConnected: true,
    githubWorkItems: [issue, pullRequest],
    now,
    runningEntry: running,
  })
  expect(
    buildGithubWorkRows([issue, pullRequest], summaries, snapshot.trackingStatus.running?.sourceId ?? null).map(
      row => ({ id: row.id, isRunning: row.isRunning, seconds: row.totalTrackedSeconds }),
    ),
  ).toEqual([
    { id: issue.id, isRunning: false, seconds: 0 },
    { id: pullRequest.id, isRunning: true, seconds: 600 },
  ])
  expect(snapshot.trackingStatus.running).toMatchObject({ source: 'github', sourceId: pullRequest.id })
})
