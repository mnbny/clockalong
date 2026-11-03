import type { TelegramChat } from '../services/telegram/chat'
import type { TelegramNotification } from '../services/telegram/notification-store'

import { IconPhoto } from '@tabler/icons-react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'

import { useBlobUrl } from '../hooks/useBlobUrl'
import { useCachedTelegramImage } from '../hooks/useCachedTelegramImage'
import { queryKeys } from '../lib/query-client'
import { telegramNotificationLink } from '../services/telegram/notification-link'
import { useTelegram } from '../services/telegram/session-provider'

const ImageLightbox = lazy(() => import('./ImageLightbox'))

function fullImageQuery(chat: TelegramChat, row: TelegramNotification) {
  return queryOptions({
    queryKey: queryKeys.telegram.image({
      params: { messageId: row.id, mediaId: row.message.attachment?.id, full: true },
      other: [chat.scope],
    }),
    queryFn: ({ signal }) => chat.notificationImage(row.message, true, signal),
    gcTime: 30_000,
    staleTime: 30_000,
    retry: false,
  })
}

export function TelegramNotificationImage({ row }: { row: TelegramNotification }) {
  const { chat } = useTelegram()
  const queryClient = useQueryClient()
  const attachment = row.message.attachment!
  const [openScope, setOpenScope] = useState<string>()
  const [revealed, setRevealed] = useState(!attachment.spoiler)
  const [failedUrl, setFailedUrl] = useState<string>()
  const active = !!chat?.isReady && chat.notificationScope === row.scope
  const cached = useCachedTelegramImage(
    row.scope,
    revealed ? `notification-preview:${attachment.kind}:${attachment.id}` : undefined,
  )
  const preview = useQuery({
    queryKey: queryKeys.telegram.image({
      params: { messageId: row.id, mediaId: attachment.id, full: false },
      other: [chat?.scope],
    }),
    queryFn: ({ signal }) => chat!.notificationImage(row.message, false, signal),
    enabled: active && revealed,
    staleTime: Infinity,
  })
  const url = useBlobUrl(preview.data ?? cached)
  const name = attachment.name || 'Photo'
  const preload = () => {
    if (active && revealed) void queryClient.prefetchQuery(fullImageQuery(chat, row))
  }

  return (
    <>
      <button
        type="button"
        className="rounded-box bg-primary-content/10 hover:outline-primary-content relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden hover:outline-2 focus-visible:outline-2 disabled:cursor-default"
        aria-label={attachment.spoiler && !revealed ? 'Reveal image spoiler' : `View image: ${name}`}
        disabled={!active}
        onPointerEnter={event => {
          if (event.pointerType !== 'touch') preload()
        }}
        onFocus={preload}
        onClick={() => {
          setRevealed(true)
          setOpenScope(chat?.scope)
        }}>
        {revealed && url && failedUrl !== url ? (
          <img src={url} alt="" className="size-full object-cover" onError={() => setFailedUrl(url)} />
        ) : (
          <IconPhoto className="size-6" />
        )}
      </button>
      {active && openScope === chat.scope && (
        <Suspense fallback={null}>
          <TelegramImageViewer row={row} onClose={() => setOpenScope(undefined)} />
        </Suspense>
      )}
    </>
  )
}

function TelegramImageViewer({ row, onClose }: { row: TelegramNotification; onClose: () => void }) {
  const { chat } = useTelegram()
  const image = useQuery(fullImageQuery(chat!, row))
  const url = useBlobUrl(image.data)
  const link = telegramNotificationLink(row)
  return (
    <ImageLightbox
      src={url}
      alt={row.message.attachment?.name || 'Telegram photo'}
      loading={image.isFetching || (!!image.data && !url)}
      onRetry={() => void image.refetch()}
      onClose={onClose}
      externalLink={link ? { url: link, label: 'Open message in Telegram' } : undefined}
    />
  )
}
