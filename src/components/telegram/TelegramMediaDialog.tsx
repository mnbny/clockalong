import type { TelegramChat } from '../../services/telegram/chat'

import { IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { stageTelegramMedia } from '../../services/telegram/chat-media'
import { useTelegramHistory } from '../../services/telegram/chat-queries'
import { attachmentLabel, chatError, mediaType } from '../../utils/telegram-chat'
import { TelegramDownloadButton } from './TelegramDownloadButton'

export type MediaSelection = { messageId: number; topicId: number | null; mediaId?: string }

export function TelegramMediaDialog({
  chat,
  selection,
  onClose,
}: {
  chat: TelegramChat
  selection: MediaSelection
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const history = useTelegramHistory({ topicId: selection.topicId })
  const message = useMemo(
    () => history.data?.pages.flatMap(page => page.items).find(item => item.view.id === selection.messageId)?.view,
    [history.data, selection.messageId],
  )
  const available = !!message?.attachment?.downloadable && message.attachment.id === selection.mediaId
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  useEffect(() => {
    if (!available) {
      onClose()
      return
    }
    const node = dialog.current!
    const controller = new AbortController()
    let release: (() => Promise<void>) | undefined
    const detach = () => {
      const video = node.querySelector('video')
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
      node.querySelector('img')?.removeAttribute('src')
    }
    const cancel = () => {
      detach()
      controller.abort()
      void release?.()
    }
    chat.signal.addEventListener('abort', cancel, { once: true })
    setUrl(null)
    setError('')
    setProgress(null)
    void stageTelegramMedia(chat, selection.messageId, controller.signal, (done, total) => {
      if (!controller.signal.aborted) setProgress(Math.round((done / total) * 100))
    })
      .then(result => {
        release = result.release
        if (controller.signal.aborted) void release()
        else setUrl(result.url)
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(chatError(error))
      })
    return () => {
      chat.signal.removeEventListener('abort', cancel)
      cancel()
    }
  }, [chat, selection.messageId, available, attempt, onClose])

  const attachment = message?.attachment
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-label={attachment ? attachmentLabel(attachment) : 'Telegram media'}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={event => {
        if (event.key !== 'Tab') event.stopPropagation()
      }}>
      <div className="modal-box bg-base-100 flex max-h-[90dvh] w-[90dvw] max-w-4xl flex-col gap-3 rounded-lg p-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="min-w-0 truncate font-semibold">{attachment ? attachmentLabel(attachment) : 'Media'}</h2>
          <button
            className="btn btn-ghost btn-square btn-sm"
            type="button"
            aria-label="Close media"
            onClick={onClose}
            autoFocus>
            <IconX className="size-5" />
          </button>
        </div>
        {error ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-error text-sm" role="alert">
              {error}
            </p>
            <button className="btn btn-sm" type="button" onClick={() => setAttempt(value => value + 1)}>
              Retry
            </button>
          </div>
        ) : url && attachment ? (
          <div className="flex min-h-0 items-center justify-center overflow-hidden">
            {mediaType(attachment) === 'video' ? (
              <video
                src={url}
                className="max-h-[65dvh] max-w-full"
                controls
                preload="metadata"
                onError={event => {
                  event.currentTarget.pause()
                  event.currentTarget.removeAttribute('src')
                  event.currentTarget.load()
                  setError('This video could not be played. Download it to open in another player.')
                }}
              />
            ) : (
              <img
                src={url}
                alt={attachmentLabel(attachment)}
                className="max-h-[65dvh] max-w-full object-contain"
                onError={() => setError('This image could not be displayed. Try downloading it.')}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3 p-12 text-center">
            <p className="text-base-content/65 text-sm">Loading media{progress === null ? '…' : ` · ${progress}%`}</p>
            <progress
              className="progress progress-primary w-56"
              {...(progress === null ? {} : { value: progress, max: 100 })}
            />
          </div>
        )}
        {available && <TelegramDownloadButton messageId={selection.messageId} />}
      </div>
      <button className="modal-backdrop" aria-label="Close media" type="button" onClick={onClose} />
    </dialog>
  )
}
