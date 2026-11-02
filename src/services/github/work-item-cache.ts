import type { DB } from '../db'
import type { GithubVisibleWorkItemTypes } from '../storage/config'
import type { SyncedGithubWorkItem } from './sync'

import { db } from '../db'
import { getGithubAuthorEntry, getGithubIndexEntries, withGithubRefKey } from './work-item-index'

export type GithubCacheScope = {
  repositories: string[]
  visibleWorkItemTypes: GithubVisibleWorkItemTypes
}

export function isGithubItemInScope(
  item: { repositoryFullName: string; type: SyncedGithubWorkItem['type'] },
  scope: GithubCacheScope,
) {
  return (
    scope.repositories.includes(item.repositoryFullName) &&
    (item.type === 'issue' ? scope.visibleWorkItemTypes.issues : scope.visibleWorkItemTypes.pullRequests)
  )
}

export function createGithubWorkItemCache(database: DB) {
  const {
    githubWorkItems: workItems,
    githubWorkItemIndex: index,
    githubAuthors: authors,
    githubCacheMeta: meta,
  } = database
  let pendingWrite: Promise<unknown> = Promise.resolve()
  let generation = 0

  async function ready() {
    await database.open()
  }

  function enqueue<T>(operation: () => Promise<T>) {
    const result = pendingWrite.then(operation, operation)
    pendingWrite = result.catch(() => {})
    return result
  }

  function beginSync() {
    return ++generation
  }

  function replace(items: SyncedGithubWorkItem[], syncGeneration: number, scope: GithubCacheScope) {
    return enqueue(async () => {
      await ready()
      if (generation !== syncGeneration) throw new Error('GitHub sync superseded')
      let deleted = 0
      await database.transaction('rw', workItems, index, authors, meta, async () => {
        const scopes = await workItems.orderBy('[repositoryFullName+type]').uniqueKeys()
        for (const key of scopes) {
          const [repositoryFullName, type] = key as unknown as [string, SyncedGithubWorkItem['type']]
          if (isGithubItemInScope({ repositoryFullName, type }, scope)) continue
          while (true) {
            const ids = await workItems.where('[repositoryFullName+type]').equals(key).limit(250).primaryKeys()
            if (!ids.length) break
            await index.where('rowId').anyOf(ids).delete()
            await authors.bulkDelete(ids)
            await workItems.bulkDelete(ids)
            deleted += ids.length
          }
        }
        const ids = items.map(item => item.id)
        if (ids.length) {
          await index.where('rowId').anyOf(ids).delete()
          await authors.bulkDelete(ids)
          await workItems.bulkPut(items.map(withGithubRefKey))
          await index.bulkPut(items.flatMap(getGithubIndexEntries))
          await authors.bulkPut(items.flatMap(item => getGithubAuthorEntry(item) ?? []))
        }
        const previous = await meta.get('revision')
        await meta.put({ key: 'revision', revision: (previous?.revision ?? 0) + 1 })
      })
      return { deleted, stored: items.length }
    })
  }

  function clear() {
    ++generation
    return enqueue(async () => {
      await ready()
      let count = 0
      await database.transaction('rw', workItems, index, authors, meta, async () => {
        count = await workItems.count()
        await workItems.clear()
        await index.clear()
        await authors.clear()
        const previous = await meta.get('revision')
        await meta.put({ key: 'revision', revision: (previous?.revision ?? 0) + 1 })
      })
      return count
    })
  }

  return { beginSync, clear, database, ready, replace }
}

export const githubWorkItemCache = createGithubWorkItemCache(db)

// The old cache is intentionally discarded; the next sync rebuilds it.
try {
  globalThis.localStorage?.removeItem('clockalong.github.workItems.v1')
} catch (error) {
  console.warn('[github sync] could not remove obsolete localStorage cache', error)
}
