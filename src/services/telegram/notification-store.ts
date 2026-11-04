import type { DB } from '../db'
import type { PaseoRun } from '../paseo/triggers'
import type { ChatMessage } from './chat-data'

export type TelegramNotification = {
  scope: string
  id: number
  message: ChatMessage
  topicTitle?: string
  collectedAt: number
  // Zero means visible. Telegram read markers never enter this state.
  clearedAt: number
  deleted: boolean
  devReplayRun?: string
  devClearedAt?: number
}
export type TelegramNotificationCheckpoint = { scope: string; lastMessageId: number }
export type NotificationMessage = { message: ChatMessage; topicTitle?: string }

export function eligibleNotification(message: ChatMessage, accountId: string) {
  return (
    !message.outgoing &&
    !message.service &&
    !!message.sender &&
    !(message.sender.kind === 'user' && message.sender.id === accountId)
  )
}

export class TelegramNotificationStore {
  constructor(
    readonly database: DB,
    readonly scope: string,
    readonly accountId: string,
  ) {}

  checkpoint() {
    return this.database.telegramNotificationCheckpoints.get(this.scope)
  }

  async visible(devReplayRun?: string) {
    const table = this.database.telegramNotifications
    const rows = await table
      .where('[scope+clearedAt+id]')
      .between([this.scope, 0, -Infinity], [this.scope, 0, Infinity])
      .toArray()
    if (devReplayRun) {
      const replay = await table
        .where('[scope+devReplayRun]')
        .equals([this.scope, devReplayRun])
        .filter(row => !!row.clearedAt && !row.devClearedAt)
        .toArray()
      rows.push(...replay)
    }
    return rows.sort((a, b) => b.id - a.id)
  }

  async merge(
    items: NotificationMessage[],
    options: {
      checkpoint?: number
      onlyExisting?: boolean
      devReplayRun?: string
      replayIds?: number[]
      active?: () => boolean
      runs?: PaseoRun[]
    } = {},
  ) {
    const { database, scope } = this
    await database.transaction(
      'rw',
      database.telegramNotifications,
      database.telegramNotificationCheckpoints,
      database.paseoRuns,
      async () => {
        if (options.active && !options.active()) return
        const checkpoint = await this.checkpoint()
        for (const { message, topicTitle } of items) {
          if (!eligibleNotification(message, this.accountId)) continue
          const existing = await database.telegramNotifications.get([scope, message.id])
          const replay = !!options.devReplayRun && options.replayIds?.includes(message.id)
          if (!existing && options.onlyExisting && !replay) continue
          const newer = !existing || (message.editDate ?? 0) >= (existing.message.editDate ?? 0)
          if (!existing && !options.onlyExisting && !options.devReplayRun) {
            for (const run of options.runs ?? []) {
              if (run.messageId === message.id && run.scope === scope && !(await database.paseoRuns.get(run.id))) {
                await database.paseoRuns.add(run)
              }
            }
          }
          await database.telegramNotifications.put({
            scope,
            id: message.id,
            message: newer && !existing?.deleted ? message : existing.message,
            topicTitle: topicTitle ?? existing?.topicTitle,
            collectedAt: existing?.collectedAt ?? Date.now(),
            clearedAt: existing?.clearedAt ?? (options.onlyExisting ? Date.now() : 0),
            deleted: existing?.deleted ?? false,
            devReplayRun: replay ? options.devReplayRun : existing?.devReplayRun,
            devClearedAt: replay && existing?.devReplayRun !== options.devReplayRun ? 0 : existing?.devClearedAt,
          })
        }
        if (options.checkpoint !== undefined) {
          await database.telegramNotificationCheckpoints.put({
            scope,
            lastMessageId: Math.max(checkpoint?.lastMessageId ?? 0, options.checkpoint),
          })
        }
        if (options.active && !options.active()) throw new DOMException('Scope ended', 'AbortError')
      },
    )
  }

  async removeSources(ids: number[], active: () => boolean = () => true) {
    const table = this.database.telegramNotifications
    await this.database.transaction('rw', table, async () => {
      if (!active()) return
      // Basic-group deletion IDs are account-wide: only already-known rows in this scope may change.
      for (const id of ids) {
        const row = await table.get([this.scope, id])
        if (row)
          await table.put({
            ...row,
            deleted: true,
            message: { ...row.message, text: '', entities: [], attachment: null },
          })
      }
      if (!active()) throw new DOMException('Scope ended', 'AbortError')
    })
  }

  async clear(id?: number | number[], devReplayRun?: string) {
    const table = this.database.telegramNotifications
    await this.database.transaction('rw', table, async () => {
      const now = Date.now()
      const rows =
        id === undefined
          ? await this.visible(devReplayRun)
          : await table.bulkGet((Array.isArray(id) ? id : [id]).map(value => [this.scope, value]))
      for (const row of rows)
        if (row)
          await table.put({
            ...row,
            clearedAt: row.clearedAt || now,
            devClearedAt: row.devReplayRun === devReplayRun ? now : row.devClearedAt,
          })
    })
  }
}
