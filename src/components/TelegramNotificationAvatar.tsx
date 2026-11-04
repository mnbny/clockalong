import type { TelegramNotification } from '../services/telegram/notification-store'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useBlobUrl } from '../hooks/useBlobUrl'
import { useCachedTelegramImage } from '../hooks/useCachedTelegramImage'
import { queryKeys } from '../lib/query-client'
import { useTelegram } from '../services/telegram/session-provider'

export function TelegramNotificationAvatar({ row }: { row: TelegramNotification }) {
  const { chat } = useTelegram()
  const { sender } = row.message
  const active = !!chat?.isReady && chat.notificationScope === row.scope
  const cached = useCachedTelegramImage(
    row.scope,
    sender?.avatarId ? `avatar:${sender.kind}:${sender.id}:${sender.avatarId}:small` : undefined,
  )
  const { data } = useQuery({
    queryKey: queryKeys.telegram.avatar({
      params: { senderId: sender ? `${sender.kind}:${sender.id}` : '', photoId: sender?.avatarId },
      other: [chat?.scope],
    }),
    queryFn: ({ signal }) => chat!.avatar(row.message, signal),
    enabled: active && !!sender?.avatarId,
    staleTime: Infinity,
  })
  const url = useBlobUrl(data ?? cached)
  const [failedUrl, setFailedUrl] = useState<string>()
  const name = sender?.name || sender?.username || 'Unknown sender'

  return (
    <div
      className="bg-primary-content/10 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
      aria-hidden>
      {url && url !== failedUrl ? (
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailedUrl(url)} />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  )
}
