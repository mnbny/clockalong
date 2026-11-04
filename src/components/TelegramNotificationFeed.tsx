import type { TelegramNotification } from '../services/telegram/notification-store'

import { IconExternalLink, IconPaperclip, IconX } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useCallback, useMemo } from 'react'

import { useDexieQuery } from '../hooks/useDexieQuery'
import { isImageAttachment } from '../services/telegram/attachment-image'
import { groupTelegramNotifications } from '../services/telegram/notification-groups'
import { telegramNotificationLink } from '../services/telegram/notification-link'
import { useTelegram } from '../services/telegram/session-provider'
import { appToast } from './AppToaster'
import { TelegramNotificationAvatar } from './TelegramNotificationAvatar'
import { TelegramNotificationImage } from './TelegramNotificationImage'
import { TelegramNotificationReply } from './TelegramNotificationReply'

export function TelegramNotificationFeed({ onSnooze }: { onSnooze: () => Promise<void> }) {
  const { notifications } = useTelegram()
  const { store, devReplayRun } = notifications
  const query = useCallback(async () => (store ? store.visible(devReplayRun) : []), [store, devReplayRun])
  const result = useDexieQuery(query, store?.scope)
  const clear = useMutation({
    mutationFn: (ids?: number[]) => store!.clear(ids, devReplayRun),
    onError: () => appToast.error('Could not clear Telegram notifications. Try again.'),
  })
  const groups = useMemo(() => groupTelegramNotifications(result.data ?? []), [result.data])
  if (!store) return null

  return (
    <aside
      aria-label="Telegram notifications"
      className="rounded-box fixed top-18 right-4 z-20 flex max-h-[calc(100dvh-5.5rem)] w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {(result.error || notifications.error) && (
        <div className="bg-base-200 border-base-300 rounded-box border p-3 text-xs shadow-md" role="status">
          Could not refresh notifications. Saved cards are kept.
          <button
            type="button"
            className="btn btn-ghost btn-xs ml-2"
            onClick={() => {
              result.retry()
              void notifications.retry()
            }}>
            Retry
          </button>
        </div>
      )}
      {!!groups.length && (
        <div
          className="scrollbar-hidden min-h-0 space-y-2 overflow-y-auto overscroll-contain p-1"
          aria-label="Saved Telegram messages">
          {groups.map(group => (
            <NotificationCard
              key={`${group[0].scope}:${group[0].message.topicId}:${group[0].message.groupedId ? `album:${group[0].message.groupedId}` : `message:${group[0].id}`}`}
              rows={group}
              disabled={clear.isPending}
              onClear={() => clear.mutate(group.map(row => row.id))}
            />
          ))}
        </div>
      )}
      {!!groups.length && (
        <div className="flex shrink-0 justify-end gap-2 px-1">
          <button type="button" className="btn btn-primary btn-sm shadow-md" onClick={() => void onSnooze()}>
            Snooze 15 min
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm shadow-md"
            disabled={clear.isPending}
            onClick={() => clear.mutate(undefined)}>
            Clear all
          </button>
        </div>
      )}
    </aside>
  )
}

function NotificationCard({
  rows,
  disabled,
  onClear,
}: {
  rows: TelegramNotification[]
  disabled: boolean
  onClear: () => void
}) {
  const row = rows[0]
  const { message } = row
  const sender = message.sender?.name || message.sender?.username || 'Unknown sender'
  const messageLink = telegramNotificationLink(row)
  const ordered = [...rows].sort((a, b) => a.id - b.id)
  const replies = [
    ...new Map(
      ordered
        .filter(item => !item.deleted && item.message.replyToId)
        .map(item => [`${item.message.replyOutsideGroup}:${item.message.replyToId}`, item]),
    ).values(),
  ]
  const images = ordered.filter(
    item => !item.deleted && !item.message.protected && isImageAttachment(item.message.attachment),
  )
  const files = ordered.filter(item => !item.deleted && item.message.attachment && !images.includes(item))
  const text = ordered
    .filter(item => !item.deleted)
    .map(item => item.message.text)
    .filter(Boolean)
    .join('\n\n')
  return (
    <article
      className="bg-primary text-primary-content border-primary-content/15 rounded-box border p-3 shadow-lg"
      aria-label={`Message from ${sender}`}>
      <div className="flex items-start gap-2">
        <TelegramNotificationAvatar row={row} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold break-words">{sender}</div>
          <div className="text-primary-content/70 text-xs break-words">
            {row.topicTitle && <span>{row.topicTitle} · </span>}
            <time
              dateTime={new Date(message.date * 1000).toISOString()}
              title={new Date(message.date * 1000).toLocaleString()}>
              {new Date(message.date * 1000).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
            {!!message.editDate && !row.deleted && ' · edited'}
          </div>
        </div>
        {messageLink && (
          <button
            type="button"
            className="btn btn-square btn-ghost text-primary-content hover:bg-primary-content/10 btn-xs shrink-0"
            aria-label="Open message in Telegram"
            title="Open message in Telegram"
            onClick={() => {
              void openUrl(messageLink).catch(() => {
                appToast.error('Could not open Telegram. Check that the app is installed.')
              })
            }}>
            <IconExternalLink className="size-4" />
          </button>
        )}
        <button
          type="button"
          className="btn btn-square btn-ghost text-primary-content hover:bg-primary-content/10 disabled:text-primary-content/40 btn-xs shrink-0"
          disabled={disabled}
          onClick={onClear}
          aria-label={`Clear message from ${sender}`}>
          <IconX className="size-4" />
        </button>
      </div>
      {rows.every(item => item.deleted) ? (
        <p className="text-primary-content/70 mt-2 text-sm italic">Message deleted</p>
      ) : (
        <>
          {replies.map(item => (
            <TelegramNotificationReply key={`${item.message.replyOutsideGroup}:${item.message.replyToId}`} row={item} />
          ))}
          {text && (
            <p className="mt-2 text-sm leading-5 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">{text}</p>
          )}
          {!!images.length && (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map(item => (
                <TelegramNotificationImage
                  key={`${item.id}:${item.message.attachment!.id}:${item.message.attachment!.spoiler}`}
                  row={item}
                />
              ))}
            </div>
          )}
          {files.map(item => {
            const attachment = item.message.attachment!
            return (
              <div key={item.id} className="bg-primary-content/10 mt-2 flex items-start gap-2 rounded-lg p-2 text-xs">
                <IconPaperclip className="size-4 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere] break-words">
                  {attachment.name || attachment.kind.replace(/^messageMedia/, '')}
                  {attachment.size !== undefined && ` · ${Math.ceil(attachment.size / 1024)} KB`}
                  {attachment.spoiler && ' · Spoiler'}
                </span>
              </div>
            )
          })}
          {rows.some(item => item.deleted) && (
            <p className="text-primary-content/70 mt-2 text-xs italic">An attachment was deleted</p>
          )}
        </>
      )}
    </article>
  )
}
