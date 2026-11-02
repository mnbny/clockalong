import type { BuildMcpSnapshotInput, McpTrackableWorkRow } from './snapshot'

import { db } from '../db'
import { queryGithubWorkItems } from '../github/work-item-queries'
import { storage } from '../storage/config'
import { buildMcpSnapshot } from './snapshot'

export type McpListWorkArguments = {
  capturedAt: string
  nonGithubRows: Array<McpTrackableWorkRow & { isClosed: boolean; statusType?: string }>
  source: 'github' | 'linear' | 'quick_timer' | null
  query: string | null
  includeClosed: boolean
  limit: number
  githubConnected: boolean
  githubTracking: Array<
    Pick<
      McpTrackableWorkRow,
      'id' | 'isRunning' | 'lastTrackedAt' | 'totalTrackedAmount' | 'totalTrackedAmountCurrency' | 'totalTrackedSeconds'
    >
  >
}

export async function listMcpWork(
  arguments_: McpListWorkArguments,
  input: BuildMcpSnapshotInput,
  deadlineAt: number,
  signal?: AbortSignal,
) {
  if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
  if (Boolean(input.githubConnected) !== arguments_.githubConnected)
    throw new Error('GitHub connection state changed; retry the request')
  const otherRows = arguments_.nonGithubRows.filter(row => {
    if (arguments_.source && row.source !== arguments_.source) return false
    if (!arguments_.includeClosed && row.isClosed) return false
    const text = arguments_.query?.toLowerCase()
    return !text || [row.title, row.identifier, row.repository].some(value => value?.toLowerCase().includes(text))
  })
  let githubRows: Array<McpTrackableWorkRow & { isClosed: boolean; statusType?: string }> = []
  let githubHasMore = false
  if (input.githubConnected && (!arguments_.source || arguments_.source === 'github')) {
    const [repositories, visibleWorkItemTypes] = await Promise.all([
      storage.get('githubSelectedRepositories'),
      storage.get('githubVisibleWorkItemTypes'),
    ])
    const page = await queryGithubWorkItems(db, {
      scope: { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes },
      showAll: true,
      showClosed: arguments_.includeClosed,
      closedCaseInsensitive: true,
      search: arguments_.query ?? undefined,
      limit: arguments_.limit + 1,
      deadlineAt,
      signal,
    })
    githubHasMore = page.hasMore
    const trackingById = new Map(arguments_.githubTracking.map(summary => [summary.id, summary]))
    githubRows = buildMcpSnapshot({
      clockifyConnected: false,
      githubConnected: true,
      githubWorkItems: page.rows,
      now: new Date(arguments_.capturedAt),
    })
      .trackableWork.filter(row => row.source === 'github')
      .map(row => ({ ...row, ...trackingById.get(row.id) }))
  }
  if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
  const rows = [
    ...otherRows.filter(row => row.source === 'linear'),
    ...githubRows,
    ...otherRows.filter(row => row.source === 'quick_timer'),
  ]
  return {
    capturedAt: arguments_.capturedAt,
    truncated: githubHasMore || rows.length > arguments_.limit,
    rows: rows.slice(0, arguments_.limit).map(({ isClosed: _isClosed, statusType: _statusType, ...row }) => row),
  }
}
