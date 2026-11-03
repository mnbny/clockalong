import type { BuildMcpSnapshotInput, McpTrackableWorkRow } from './snapshot'

import { queryClient, queryKeys } from '../../lib/query-client'
import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { queryClockifySummaries } from '../clockify/entry-queries'
import { selectClockifyWorkspace } from '../clockify/workspaces'
import { db } from '../db'
import { isGithubItemInScope } from '../github/work-item-cache'
import { queryGithubWorkItems } from '../github/work-item-queries'
import { getGithubWorkItemInternalRef } from '../github/work-item-summaries'
import { linearTicketCache } from '../linear/ticket-cache'
import { queryLinearMcpRows, queryLinearSummaries } from '../linear/ticket-queries'
import { storage } from '../storage/config'
import { getMcpCapture, publishMcpSnapshot } from './refresh'
import { buildGithubWorkRows, buildLinearWorkRows } from './snapshot'

export type McpListWorkArguments = {
  capturedAt: string
  source: 'github' | 'linear' | 'quick_timer' | null
  query: string | null
  includeClosed: boolean
  limit: number
}

export async function listMcpWork(
  arguments_: McpListWorkArguments,
  input: BuildMcpSnapshotInput,
  deadlineAt: number,
  signal?: AbortSignal,
) {
  let capturedAt = arguments_.capturedAt
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
    let capture = getMcpCapture(capturedAt)
    const user = queryClient.getQueryData<{ id?: string; activeWorkspace?: string; defaultWorkspace?: string }>(
      queryKeys.clockify.loggedUser,
    )
    const workspaces = queryClient.getQueryData<Array<{ id?: string }>>(queryKeys.clockify.workspaces)
    const workspace = selectClockifyWorkspace(user, workspaces)
    const scopeChanged =
      input.clockifyConnected && user?.id && workspace?.id
        ? capture?.scope?.userId !== user.id || capture?.scope?.workspaceId !== workspace.id
        : Boolean(capture?.scope)
    if (
      !capture ||
      capture.githubConnected !== Boolean(input.githubConnected) ||
      capture.clockifyConnected !== Boolean(input.clockifyConnected) ||
      capture.linearConnected !== Boolean(input.linearConnected) ||
      scopeChanged ||
      capture.linearLifecycle !== linearTicketCache.getLifecycle() ||
      (input.linearConnected && capture.linearViewerId !== linearTicketCache.getViewer())
    ) {
      capturedAt = (await publishMcpSnapshot(input, { deadlineAt, signal })).capturedAt
      capture = getMcpCapture(capturedAt)!
    }
    const wantsLinear = Boolean(input.linearConnected && (!arguments_.source || arguments_.source === 'linear'))
    if (wantsLinear && !capture.linearViewerId) throw new Error('Linear viewer is not ready; refresh and retry')
    const otherRows = capture.rows.filter(row => {
      if (arguments_.source && row.source !== arguments_.source) return false
      if (!arguments_.includeClosed && row.isClosed) return false
      const text = arguments_.query?.toLowerCase()
      return !text || [row.title, row.identifier, row.repository].some(value => value?.toLowerCase().includes(text))
    })
    const [repositories, visibleWorkItemTypes] =
      input.githubConnected && (!arguments_.source || arguments_.source === 'github')
        ? await Promise.all([storage.get('githubSelectedRepositories'), storage.get('githubVisibleWorkItemTypes')])
        : ([[], { issues: false, pullRequests: false }] as const)
    const githubScope = { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes }
    const githubPage =
      input.githubConnected && (!arguments_.source || arguments_.source === 'github')
        ? await queryGithubWorkItems(db, {
            scope: githubScope,
            showAll: true,
            showClosed: arguments_.includeClosed,
            closedCaseInsensitive: true,
            search: arguments_.query ?? undefined,
            limit: arguments_.limit + 1,
            deadlineAt,
            signal,
          })
        : null
    const result = await db.transaction(
      'r',
      [
        db.clockifyEntries,
        db.clockifyEntryRefs,
        db.clockifyCacheMeta,
        db.linearTickets,
        db.linearCacheMeta,
        db.githubWorkItems,
      ],
      async () => {
        if (
          ((await db.clockifyCacheMeta.get('revision'))?.revision ?? 0) !== capture.revision ||
          ((await db.linearCacheMeta.get('state'))?.revision ?? 0) !== capture.linearRevision
        )
          return null
        const running = capture.runningEntry ? [capture.runningEntry] : []
        const linear =
          wantsLinear && capture.linearViewerId
            ? await queryLinearMcpRows(
                db,
                capture.linearViewerId,
                arguments_.limit,
                arguments_.includeClosed,
                arguments_.query,
                deadlineAt,
                signal,
              )
            : []
        const linearSummaries =
          capture.scope && capture.linearViewerId && linear.length
            ? await queryLinearSummaries(
                db,
                capture.linearViewerId,
                capture.scope,
                linear,
                running,
                new Date(capturedAt),
                deadlineAt,
                signal,
              )
            : {}
        const githubSummaries =
          capture.scope && githubPage?.rows.length
            ? await queryClockifySummaries(
                db,
                capture.scope,
                githubPage.rows,
                item => item.id,
                getGithubWorkItemInternalRef,
                running,
                new Date(capturedAt),
                deadlineAt,
                signal,
                async entries => {
                  if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
                  const refsByEntry = entries.map(entry => ({
                    id: entry.id,
                    refs: parseInternalRefs(entry.description)
                      .filter(ref => ref.provider === 'github')
                      .map(ref => normalizeInternalRef(formatInternalRef(ref))),
                  }))
                  const refs = [...new Set(refsByEntry.flatMap(entry => entry.refs))]
                  const items = refs.length ? await db.githubWorkItems.where('refKey').anyOf(refs).toArray() : []
                  const byRef = new Map(
                    items.filter(item => isGithubItemInScope(item, githubScope)).map(item => [item.refKey, item.id]),
                  )
                  return new Map(
                    refsByEntry.flatMap(entry => {
                      const owner = entry.refs.map(ref => byRef.get(ref)).find(Boolean)
                      return entry.id && owner ? [[entry.id, owner] as const] : []
                    }),
                  )
                },
              )
            : {}
        return { linear, linearSummaries, githubSummaries }
      },
    )
    if (
      !result ||
      capture.linearLifecycle !== linearTicketCache.getLifecycle() ||
      (input.linearConnected && capture.linearViewerId !== linearTicketCache.getViewer())
    ) {
      capturedAt = (await publishMcpSnapshot(input, { deadlineAt, signal })).capturedAt
      continue
    }
    if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
    const running = capture.runningSource
    const linearRows = buildLinearWorkRows(
      result.linear,
      result.linearSummaries,
      running?.source === 'linear' ? running.sourceId : null,
    )
    const githubRows = githubPage
      ? buildGithubWorkRows(
          githubPage.rows,
          result.githubSummaries,
          running?.source === 'github' ? running.sourceId : null,
        )
      : []
    const rows: Array<McpTrackableWorkRow & { isClosed: boolean }> = [
      ...linearRows,
      ...githubRows,
      ...otherRows.filter(row => row.source === 'quick_timer'),
    ]
    return {
      capturedAt,
      truncated: Boolean(githubPage?.hasMore) || rows.length > arguments_.limit,
      rows: rows.slice(0, arguments_.limit).map(({ isClosed: _isClosed, ...row }) => row),
    }
  }
  throw new Error('Tracking data changed during capture; retry the request')
}
