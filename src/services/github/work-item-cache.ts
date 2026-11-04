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
  let generation = 0

  function beginSync() {
    return ++generation
  }

  async function replace(items: SyncedGithubWorkItem[], syncGeneration: number, scope: GithubCacheScope) {
    await database.open()
    return database.transaction('rw', workItems, index, authors, meta, async () => {
      if (generation !== syncGeneration) throw new Error('GitHub sync superseded')
      let deleted = 0
      const scopes: [string, SyncedGithubWorkItem['type']][] = []
      let previousScope: string | undefined
      // WebKit can fail to open unique index cursors. Group ordinary sorted keys instead.
      await workItems.orderBy('[repositoryFullName+type]').eachKey(key => {
        const scopeKey = JSON.stringify(key)
        if (scopeKey === previousScope) return
        previousScope = scopeKey
        scopes.push(key as [string, SyncedGithubWorkItem['type']])
      })
      for (const key of scopes) {
        const [repositoryFullName, type] = key
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
      if (generation !== syncGeneration) throw new Error('GitHub sync superseded')
      return { deleted, stored: items.length }
    })
  }

  async function clear() {
    ++generation
    await database.open()
    return database.transaction('rw', workItems, index, authors, meta, async () => {
      const count = await workItems.count()
      await workItems.clear()
      await index.clear()
      await authors.clear()
      const previous = await meta.get('revision')
      await meta.put({ key: 'revision', revision: (previous?.revision ?? 0) + 1 })
      return count
    })
  }

  return { beginSync, clear, database, replace }
}

export const githubWorkItemCache = createGithubWorkItemCache(db)

// The old cache is intentionally discarded; the next sync rebuilds it.
try {
  globalThis.localStorage?.removeItem('clockalong.github.workItems.v1')
} catch (error) {
  console.warn('[github sync] could not remove obsolete localStorage cache', error)
}
