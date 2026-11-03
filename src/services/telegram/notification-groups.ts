import type { TelegramNotification } from './notification-store'

export function groupTelegramNotifications(rows: TelegramNotification[]) {
  const groups = new Map<string, TelegramNotification[]>()
  for (const row of rows) {
    const { message } = row
    const key = JSON.stringify([
      row.scope,
      message.topicId,
      message.sender?.kind,
      message.sender?.id,
      message.groupedId ? `album:${message.groupedId}` : `message:${row.id}`,
    ])
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.values()]
}
