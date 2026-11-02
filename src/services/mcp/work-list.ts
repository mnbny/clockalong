import type { BuildMcpSnapshotInput, McpTrackableWorkRow } from './snapshot'

import { queryClient, queryKeys } from '../../lib/query-client'
import { formatInternalRef, normalizeInternalRef, parseInternalRefs } from '../../utils/templates'
import { queryClockifySummaries } from '../clockify/entry-queries'
import { selectClockifyWorkspace } from '../clockify/workspaces'
import { db } from '../db'
import { isGithubItemInScope } from '../github/work-item-cache'
import { queryGithubWorkItems } from '../github/work-item-queries'
import { getGithubWorkItemInternalRef } from '../github/work-item-summaries'
import { storage } from '../storage/config'
import { getMcpCapture, publishMcpSnapshot } from './refresh'
import { buildGithubWorkRows } from './snapshot'

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
      scopeChanged
    ) {
      capturedAt = (await publishMcpSnapshot(input, { deadlineAt, signal })).capturedAt
      capture = getMcpCapture(capturedAt)!
    }
    const otherRows = capture.rows.filter(row => {
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
      const githubScope = { repositories: repositories.map(repository => repository.fullName), visibleWorkItemTypes }
      const page = await queryGithubWorkItems(db, {
        scope: githubScope,
        showAll: true,
        showClosed: arguments_.includeClosed,
        closedCaseInsensitive: true,
        search: arguments_.query ?? undefined,
        limit: arguments_.limit + 1,
        deadlineAt,
        signal,
      })
      githubHasMore = page.hasMore
      const scope = capture.scope
      const runningEntry = capture.runningEntry
      const revision = capture.revision
      const summaries = await db.transaction(
        'r',
        db.clockifyEntries,
        db.clockifyEntryRefs,
        db.clockifyCacheMeta,
        db.githubWorkItems,
        async () => {
          if (((await db.clockifyCacheMeta.get('revision'))?.revision ?? 0) !== revision) return null
          return scope
            ? queryClockifySummaries(
                db,
                scope,
                page.rows,
                item => item.id,
                getGithubWorkItemInternalRef,
                runningEntry ? [runningEntry] : [],
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
        },
      )
      if (!summaries) {
        capturedAt = (await publishMcpSnapshot(input, { deadlineAt, signal })).capturedAt
        continue
      }
      const running = capture.runningSource
      githubRows = buildGithubWorkRows(page.rows, summaries, running?.source === 'github' ? running.sourceId : null)
    } else {
      const revision = (await db.clockifyCacheMeta.get('revision'))?.revision ?? 0
      if (revision !== capture.revision) {
        capturedAt = (await publishMcpSnapshot(input, { deadlineAt, signal })).capturedAt
        continue
      }
    }
    if (signal?.aborted || Date.now() >= deadlineAt) throw new Error('MCP request timed out or cancelled')
    const rows = [
      ...otherRows.filter(row => row.source === 'linear'),
      ...githubRows,
      ...otherRows.filter(row => row.source === 'quick_timer'),
    ]
    return {
      capturedAt,
      truncated: githubHasMore || rows.length > arguments_.limit,
      rows: rows.slice(0, arguments_.limit).map(({ isClosed: _isClosed, ...row }) => row),
    }
  }
  throw new Error('Clockify data changed during capture; retry the request')
}
