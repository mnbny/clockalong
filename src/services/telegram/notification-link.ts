import type { ChatMessage } from './chat-data'

export function telegramNotificationLink(row: { scope: string; message: Pick<ChatMessage, 'id' | 'topicId'> }) {
  const channel = /^\d+:supergroup:([1-9]\d*)$/.exec(row.scope)?.[1]
  if (!channel || !Number.isSafeInteger(row.message.id) || row.message.id <= 0) return null
  const params = new URLSearchParams({ channel, post: String(row.message.id) })
  const topic = row.message.topicId
  if (topic !== null && Number.isSafeInteger(topic) && topic > 0) params.set('thread', String(topic))
  return `tg://privatepost?${params}`
}
