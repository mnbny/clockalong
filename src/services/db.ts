import type { ClockifyEntryRef, StoredClockifyEntry } from './clockify/entry-cache'
import type { SyncedGithubWorkItem } from './github/sync'
import type { GithubAuthorIndex, GithubWorkItemIndex, StoredGithubWorkItem } from './github/work-item-index'
import type { StoredLinearTicket } from './linear/ticket-cache'
import type { PaseoRun } from './paseo/triggers'
import type { TelegramNotification, TelegramNotificationCheckpoint } from './telegram/notification-store'

import Dexie, { type Table } from 'dexie'

import { getGithubAuthorEntry, getGithubIndexEntries, withGithubRefKey } from './github/work-item-index'

export class DB extends Dexie {
  declare paseoRuns: Table<PaseoRun, string>
  declare githubWorkItems: Table<StoredGithubWorkItem, string, SyncedGithubWorkItem>
  declare githubWorkItemIndex: Table<GithubWorkItemIndex, [string, string, string]>
  declare githubAuthors: Table<GithubAuthorIndex, string>
  declare githubCacheMeta: Table<{ key: string; revision: number }, string>
  declare clockifyEntries: Table<StoredClockifyEntry, [string, string, string]>
  declare clockifyEntryRefs: Table<ClockifyEntryRef, [string, string, string, string]>
  declare clockifyCacheMeta: Table<{ key: string; revision: number }, string>
  declare linearTickets: Table<StoredLinearTicket, [string, string]>
  declare linearCacheMeta: Table<{ key: string; revision: number; sequence: number }, string>
  declare telegramNotifications: Table<TelegramNotification, [string, number]>
  declare telegramNotificationCheckpoints: Table<TelegramNotificationCheckpoint, string>

  constructor(name = 'clockalong') {
    super(name)
    this.version(1).stores({ githubWorkItems: 'id' })
    this.version(2)
      .stores({
        githubWorkItems: 'id,[repositoryFullName+type],refKey',
        githubWorkItemIndex: '[token+updatedAt+rowId],rowId',
        githubAuthors: 'id,[usernameKey+id]',
        githubCacheMeta: 'key',
      })
      .upgrade(async transaction => {
        const items = transaction.table<SyncedGithubWorkItem, string>('githubWorkItems')
        const index = transaction.table<GithubWorkItemIndex, [string, string, string]>('githubWorkItemIndex')
        const authors = transaction.table<GithubAuthorIndex, string>('githubAuthors')
        let lastId: string | undefined
        while (true) {
          const batch = await (lastId ? items.where(':id').above(lastId) : items.orderBy(':id')).limit(250).toArray()
          if (!batch.length) break
          await items.bulkPut(batch.map(withGithubRefKey))
          await index.bulkPut(batch.flatMap(getGithubIndexEntries))
          await authors.bulkPut(batch.flatMap(item => getGithubAuthorEntry(item) ?? []))
          lastId = batch[batch.length - 1].id
        }
      })
    this.version(3).stores({
      clockifyEntries: '[userId+workspaceId+id],[userId+workspaceId+startedAt+id]',
      clockifyEntryRefs:
        '[userId+workspaceId+refKey+entryId],[userId+workspaceId+refKey+startedAt+entryId],[userId+workspaceId+entryId]',
      clockifyCacheMeta: 'key',
    })
    this.version(4).stores({
      linearTickets:
        '[viewerId+id],[viewerId+refKey],[viewerId+sequence+id],[viewerId+createdAtMs+id],[viewerId+updatedAtMs+id]',
      linearCacheMeta: 'key',
    })
    this.version(5).stores({
      telegramNotifications: '[scope+id],scope,[scope+clearedAt+id],[scope+devReplayRun]',
      telegramNotificationCheckpoints: 'scope',
    })
    this.version(6).stores({ paseoRuns: 'id,status,createdAt,scope' })
    this.version(7)
      .stores({ paseoRuns: 'id,status,createdAt,scope' })
      .upgrade(async transaction => {
        await transaction
          .table<PaseoRun & { args?: string[]; cwd?: string }>('paseoRuns')
          .toCollection()
          .modify(run => {
            delete run.args
            delete run.cwd
            if (!run.request && (run.status === 'pending' || run.status === 'dispatching')) {
              run.status = run.status === 'pending' ? 'cancelled' : 'unconfirmed'
              run.detail =
                'The trigger format changed. Review the trigger’s project and agent selections before using it again.'
            }
          })
      })
  }
}

export const db = new DB()
