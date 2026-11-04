import type { TelegramNotification } from '../services/telegram/notification-store'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { queryKeys } from '../lib/query-client'
import { notificationReply } from '../services/telegram/notification-reply'
import { useTelegram } from '../services/telegram/session-provider'

export function TelegramNotificationReply({ row }: { row: TelegramNotification }) {
  const { chat, notifications } = useTelegram()
  const reply = useQuery({
    queryKey: queryKeys.telegram.reply({
      params: { messageId: row.message.replyToId, outsideGroup: row.message.replyOutsideGroup },
      other: [row.scope, chat?.scope ?? row.scope],
    }),
    queryFn: ({ signal }) => notificationReply(row, notifications.store!, chat, signal),
    enabled: notifications.store?.scope === row.scope,
    staleTime: 60_000,
    gcTime: 0,
  })
  const preview = useMemo(() => {
    const message = reply.data
    if (!message) return null
    const hiddenText = message.entities.some(entity => entity.kind === 'messageEntitySpoiler')
    const text = hiddenText ? 'Spoiler' : message.text.replace(/\s+/g, ' ').trim()
    const attachment = message.attachment
    return {
      sender: message.sender?.name || message.sender?.username || 'Unknown sender',
      text: text
        ? text.length > 160
          ? `${text.slice(0, 160)}…`
          : text
        : attachment?.spoiler
          ? 'Spoiler'
          : attachment?.name || attachment?.kind.replace(/^messageMedia/, '') || 'Message',
    }
  }, [reply.data])

  return (
    <blockquote
      className="border-primary-content/35 text-primary-content/75 mt-2 border-l-2 pl-2 text-xs"
      aria-label="Replied-to message">
      {preview ? (
        <>
          <p className="truncate font-semibold">Reply to {preview.sender}</p>
          <p className="line-clamp-2 [overflow-wrap:anywhere]">{preview.text}</p>
        </>
      ) : (
        <p>{reply.isFetching ? 'Loading reply…' : 'Reply unavailable'}</p>
      )}
    </blockquote>
  )
}
