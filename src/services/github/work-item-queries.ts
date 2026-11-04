import type { DB } from '../db'
import type { GithubSelectedAuthor } from '../storage/config'
import type { GithubCacheScope } from './work-item-cache'
import type { GithubWorkItemIndex } from './work-item-index'

import Dexie from 'dexie'

import { isGithubItemInScope } from './work-item-cache'

export type GithubPageCursor = { updatedAt: string; id: string }
export type GithubPageOptions = {
  scope: GithubCacheScope
  authors?: string[]
  labels?: string[]
  showAll?: boolean
  showClosed: boolean
  closedCaseInsensitive?: boolean
  showMentioned?: boolean
  search?: string
  cursor?: GithubPageCursor
  limit: number
  deadlineAt?: number
  signal?: AbortSignal
}

export async function queryGithubWorkItems(database: DB, options: GithubPageOptions) {
  return database.transaction(
    'r',
    database.githubCacheMeta,
    database.githubWorkItemIndex,
    database.githubWorkItems,
    async () => {
      const revision = (await database.githubCacheMeta.get('revision'))?.revision ?? 0
      const tokens = options.showAll
        ? ['all']
        : [
            ...new Set([
              ...(options.authors ?? []).map(author => `author:${author}`),
              ...(options.labels ?? []).map(label => `label:${label}`),
              ...(options.showMentioned ? ['involvement'] : []),
            ]),
          ]
      const search = options.search?.toLowerCase()
      const candidates = await Promise.all(
        tokens.map(token => {
          const lower = [token, Dexie.minKey]
          const upper = options.cursor ? [token, options.cursor.updatedAt, options.cursor.id] : [token, Dexie.maxKey]
          return database.githubWorkItemIndex
            .where('[token+updatedAt+rowId]')
            .between(lower, upper, true, !options.cursor)
            .reverse()
            .filter(entry => {
              if (options.signal?.aborted || (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt))
                throw new Error('MCP request timed out or cancelled')
              return (
                isGithubItemInScope({ repositoryFullName: entry.repository, type: entry.type }, options.scope) &&
                (options.showClosed ||
                  (options.closedCaseInsensitive
                    ? entry.state.toLowerCase() !== 'closed'
                    : entry.state !== 'closed')) &&
                (!search ||
                  [entry.title, entry.identifier, entry.repository.toLowerCase()].some(value => value.includes(search)))
              )
            })
            .limit(options.limit + 1)
            .toArray()
        }),
      )
      const unique = new Map<string, GithubWorkItemIndex>()
      for (const candidate of candidates.flat()) unique.set(candidate.rowId, candidate)
      const sorted = [...unique.values()].sort((left, right) =>
        left.updatedAt === right.updatedAt
          ? compareDescending(left.rowId, right.rowId)
          : compareDescending(left.updatedAt, right.updatedAt),
      )
      const page = sorted.slice(0, options.limit)
      const rows = (await database.githubWorkItems.bulkGet(page.map(entry => entry.rowId))).filter(
        item => item !== undefined,
      )
      const last = page[page.length - 1]
      return {
        rows,
        hasMore: sorted.length > options.limit,
        cursor: last ? { updatedAt: last.updatedAt, id: last.rowId } : undefined,
        revision,
      }
    },
  )
}

function compareDescending(left: string, right: string) {
  return left === right ? 0 : left > right ? -1 : 1
}

export async function queryGithubAuthors(database: DB, scope: GithubCacheScope) {
  const result = new Map<string, GithubSelectedAuthor>()
  await database.githubAuthors.orderBy('[usernameKey+id]').each(author => {
    if (!isGithubItemInScope({ repositoryFullName: author.repository, type: author.type }, scope)) return
    const existing = result.get(author.usernameKey)
    if (!existing || (!existing.avatarUrl && author.avatarUrl)) {
      result.set(author.usernameKey, { username: author.username, avatarUrl: author.avatarUrl })
    }
  })
  return [...result.values()]
}
