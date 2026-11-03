import type { TelegramChat } from './chat'
import type { TelegramNotification, TelegramNotificationStore } from './notification-store'

export async function notificationReply(
  row: TelegramNotification,
  store: TelegramNotificationStore,
  chat: Pick<TelegramChat, 'isReady' | 'notificationScope' | 'fetchNotificationMessages'> | null,
  signal: AbortSignal,
) {
  const id = row.message.replyToId
  if (store.scope !== row.scope || row.message.replyOutsideGroup || !id || !Number.isSafeInteger(id) || id <= 0)
    return null
  signal.throwIfAborted()
  const cached = await store.database.telegramNotifications.get([row.scope, id])
  signal.throwIfAborted()
  if (cached) return cached.deleted ? null : cached.message
  if (!chat?.isReady || chat.notificationScope !== row.scope) return null
  const records = await chat.fetchNotificationMessages([id], signal)
  signal.throwIfAborted()
  const reply = records.find(record => record.view.id === id)
  return reply?.view ?? null
}
