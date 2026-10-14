import type { OutgoingMessage, SendOperation } from '../../services/telegram/chat'
import type { ChatMessage } from '../../services/telegram/chat-data'

import { IconArrowBackUp, IconFile, IconPlayerPlay } from '@tabler/icons-react'
import { useState } from 'react'

import {
  useTelegramAvatar,
  useTelegramBlobUrl,
  useTelegramPreview,
  useTelegramReply,
} from '../../services/telegram/chat-queries'
import { attachmentLabel, chatError, fileSize, mediaType, messageExcerpt, senderName } from '../../utils/telegram-chat'
import { TelegramDownloadButton } from './TelegramDownloadButton'
import { TelegramMessageText } from './TelegramMessageText'

export function TelegramMessage({
  message,
  outgoing,
  canReply,
  canRetry,
  onRetry,
  onDismiss,
  onCancel,
  onReply,
  onMedia,
  onJump,
}: {
  message: ChatMessage
  outgoing?: OutgoingMessage
  canReply: boolean
  canRetry: boolean
  onRetry: (operation: SendOperation) => void
  onDismiss: (operation: SendOperation) => void
  onCancel: (operation: SendOperation) => void
  onReply: () => void
  onMedia: () => void
  onJump: (id: number) => void
}) {
  const avatar = useTelegramAvatar(message.id)
  const avatarUrl = useTelegramBlobUrl(avatar.data)
  const preview = useTelegramPreview(message.id)
  const file = outgoing?.operation.attachment
  const previewUrl = useTelegramBlobUrl(
    file?.mime.startsWith('image/') && file.mime !== 'image/svg+xml' ? file.source : preview.data,
  )
  const reply = useTelegramReply(message.id, !!message.replyToId && !message.replyOutsideGroup)
  const [revealed, setRevealed] = useState(false)
  const name = senderName(message)
  const attachment = message.attachment
  const media = attachment && mediaType(attachment)
  const hidden = attachment?.spoiler && !revealed
  const aspectRatio = attachment?.width && attachment.height ? `${attachment.width} / ${attachment.height}` : '4 / 3'

  return (
    <article className="group hover:bg-base-200/40 flex gap-3 px-4 py-2" data-message-id={message.id}>
      <div className="avatar placeholder shrink-0 pt-1">
        <div className="bg-base-300 text-base-content/60 flex size-8 items-center justify-center overflow-hidden rounded-full text-xs">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : name.slice(0, 2).toUpperCase()}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{name}</span>
          <time
            className="text-base-content/50 text-[11px]"
            dateTime={new Date(message.date * 1000).toISOString()}
            title={new Date(message.date * 1000).toLocaleString()}>
            {new Date(message.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          {!!message.editDate && <span className="text-base-content/40 text-[11px]">edited</span>}
        </div>
        {!!message.replyToId && (
          <button
            className="border-primary/60 text-base-content/60 mb-1 block max-w-full truncate border-l-2 pl-2 text-left text-xs disabled:cursor-default"
            type="button"
            disabled={!reply.data}
            onClick={() => onJump(message.replyToId!)}>
            {reply.data
              ? `${senderName(reply.data)}: ${messageExcerpt(reply.data)}`
              : reply.isPending && !message.replyOutsideGroup
                ? 'Loading reply…'
                : 'Reply unavailable'}
          </button>
        )}
        {!!message.service && <p className="text-base-content/60 text-sm">Group updated</p>}
        {!!message.text && <TelegramMessageText text={message.text} entities={message.entities} />}
        {!!attachment && (
          <div className="mt-2 space-y-1">
            {hidden ? (
              <button className="btn btn-soft h-28 w-full max-w-xs" type="button" onClick={() => setRevealed(true)}>
                Reveal media spoiler
              </button>
            ) : (
              <>
                {!!(media || previewUrl) && (
                  <button
                    type="button"
                    className="bg-base-200 text-base-content/65 relative block max-h-64 w-full max-w-xs overflow-hidden rounded"
                    style={{ aspectRatio }}
                    disabled={!media}
                    aria-label={media === 'video' ? 'Play video' : 'Open full-size image'}
                    onClick={onMedia}>
                    {previewUrl ? (
                      <img
                        alt={attachmentLabel(attachment)}
                        src={previewUrl}
                        className="h-full max-h-64 w-full object-contain"
                      />
                    ) : (
                      <span className="flex h-full min-h-24 items-center justify-center gap-2">
                        <IconFile className="size-6" />
                        {media === 'video' ? 'Open video' : 'Open image'}
                      </span>
                    )}
                    {media === 'video' && (
                      <span className="bg-base-100/80 absolute inset-0 m-auto flex size-10 items-center justify-center rounded-full">
                        <IconPlayerPlay className="size-5" />
                      </span>
                    )}
                  </button>
                )}
                <div className="text-base-content/70 text-xs break-words">
                  {attachmentLabel(attachment)}
                  <span className="text-base-content/45">
                    {attachment.size !== undefined && ` · ${fileSize(attachment.size)}`}
                    {attachment.duration !== undefined &&
                      ` · ${Math.floor(attachment.duration / 60)}:${String(Math.floor(attachment.duration % 60)).padStart(2, '0')}`}
                    {!!attachment.width && !!attachment.height && ` · ${attachment.width}×${attachment.height}`}
                    {!!attachment.mime && ` · ${attachment.mime}`}
                  </span>
                </div>
                {attachment.downloadable && <TelegramDownloadButton messageId={message.id} />}
              </>
            )}
          </div>
        )}
        {outgoing?.error ? (
          <div className="text-error mt-1 flex flex-wrap items-center gap-2 text-xs" role="alert">
            <span>{chatError(outgoing.error)}</span>
            <button
              className="btn btn-ghost btn-xs"
              type="button"
              disabled={!canRetry}
              onClick={() => onRetry(outgoing.operation)}>
              Retry
            </button>
            <button className="btn btn-ghost btn-xs" type="button" onClick={() => onDismiss(outgoing.operation)}>
              Dismiss
            </button>
          </div>
        ) : (
          !!outgoing &&
          !!file &&
          !outgoing.serverId && (
            <div className="mt-1 flex max-w-xs items-center gap-2">
              <progress
                className="progress progress-primary h-1 flex-1"
                aria-label="Uploading attachment"
                {...(outgoing.progress === null ? {} : { value: outgoing.progress, max: 100 })}
              />
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => onCancel(outgoing.operation)}>
                Cancel
              </button>
            </div>
          )
        )}
      </div>
      {!outgoing && (
        <button
          className="btn btn-ghost btn-square btn-xs mt-1 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
          type="button"
          aria-label={`Reply to ${name}`}
          disabled={!canReply}
          onClick={onReply}>
          <IconArrowBackUp className="size-4" />
        </button>
      )}
    </article>
  )
}
