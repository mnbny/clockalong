import type { TelegramChat } from '../../services/telegram/chat'
import type { ChatDraft } from '../../utils/telegram-chat'
import type { MediaSelection } from './TelegramMediaDialog'
import type { ComponentProps } from 'react'

import { useFocusTrap } from '@mantine/hooks'
import { IconX } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useTelegramSummary, useTelegramTopic, useTelegramTopics } from '../../services/telegram/chat-queries'
import { messageExcerpt, senderName } from '../../utils/telegram-chat'
import { PageHeader } from '../PageHeader'
import { TelegramComposer } from './TelegramComposer'
import { TelegramConversation } from './TelegramConversation'
import { TelegramMediaDialog } from './TelegramMediaDialog'
import { TelegramTopics } from './TelegramTopics'

type Props = {
  open: boolean
  chat: TelegramChat
  title: string
  selected: number | null | undefined
  onSelect: (id: number) => void
  onClose: () => void
  draft: ChatDraft
  composer: Omit<ComponentProps<typeof TelegramComposer>, 'draft' | 'replyLabel' | 'disabled' | 'canSend' | 'notice'>
  blocked: boolean
  onFiles: (files: File[], folder?: boolean) => void
  onDropError: (message: string) => void
}

export function TelegramChatPanel(props: Props) {
  const [visible, setVisible] = useState(props.open)
  useEffect(() => {
    if (props.open) {
      setVisible(true)
      return
    }
    // Keep content through daisyUI's slide-out, then release chat observers and media.
    const timer = window.setTimeout(() => setVisible(false), 300)
    return () => window.clearTimeout(timer)
  }, [props.open])

  return (
    <div className="drawer drawer-end">
      <input className="drawer-toggle" type="checkbox" checked={props.open} readOnly tabIndex={-1} aria-hidden />
      <div className="drawer-content" />
      <div className="drawer-side z-50">
        <button
          className="drawer-overlay fixed inset-0"
          type="button"
          tabIndex={-1}
          aria-label="Close Telegram chat"
          onClick={props.onClose}
        />
        <aside
          inert={!props.open}
          className="bg-base-100 text-base-content border-base-content/5 flex h-full w-[min(48rem,calc(100dvw-3rem))] flex-col border-l">
          {(props.open || visible) && <TelegramChatContents {...props} />}
        </aside>
      </div>
    </div>
  )
}

function TelegramChatContents({
  open,
  chat,
  title,
  selected,
  onSelect,
  onClose,
  draft,
  composer,
  blocked,
  onFiles,
  onDropError,
}: Props) {
  const [media, setMedia] = useState<MediaSelection | null>(null)
  const [focusReady, setFocusReady] = useState(false)
  const closeMedia = useCallback(() => setMedia(null), [])
  const trap = useFocusTrap(open && focusReady && !media)
  const topics = useTelegramTopics()
  const summary = useTelegramSummary()
  const inPages = useMemo(
    () => topics.data?.pages.flatMap(page => page.items).find(item => item.id === selected),
    [topics.data, selected],
  )
  const byId = useTelegramTopic(selected ?? null, selected !== undefined && !inPages)
  const topic = inPages ?? byId.data
  const ready = selected !== undefined && (!chat.forum || (!!topic && !topic.hidden))
  const online = chat.connection === 'connected' || chat.connection === 'updating'
  const closed = topic?.closed && !summary.data?.canSendInClosedTopics
  const canAttach = open && ready && online && !closed && !blocked && !draft.attachment && !media
  const permitted = draft.attachment
    ? draft.attachment.mode === 'media'
      ? summary.data?.canSendPhotos !== false
      : summary.data?.canSendDocuments !== false
    : summary.data?.canSendText !== false
  const canSend =
    open && ready && online && !closed && permitted && !blocked && (!!draft.text.trim() || !!draft.attachment)
  const notice = closed
    ? 'This topic is closed.'
    : !permitted
      ? 'You cannot send this message here.'
      : !online
        ? 'Reconnecting to Telegram…'
        : undefined
  const reply = draft.replyToId ? chat.cache.findMessage(draft.replyToId)?.view : undefined

  useEffect(() => {
    if (!open) {
      setMedia(null)
      setFocusReady(false)
      return
    }
    // daisyUI delays visibility while opening; focus after its slide transition.
    const timer = window.setTimeout(() => setFocusReady(true), 300)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <div
      ref={trap}
      role="dialog"
      aria-modal="true"
      aria-label={`Telegram: ${title}`}
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={event => {
        if (event.key === 'Escape' && !media) {
          event.preventDefault()
          onClose()
        }
        if (event.key !== 'Tab') event.stopPropagation()
      }}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = canAttach ? 'copy' : 'none'
        }
      }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.stopPropagation()
        if (!open || media) return
        if (!canAttach) {
          onDropError(
            draft.attachment
              ? 'Remove the selected file before choosing another.'
              : 'Attachments cannot be added right now.',
          )
          return
        }
        const folder = [...event.dataTransfer.items].some(item => item.webkitGetAsEntry?.()?.isDirectory)
        onFiles([...event.dataTransfer.files], folder)
      }}>
      <div className="border-base-content/5 border-b p-4">
        <PageHeader
          title={summary.data?.title || title}
          actions={
            <button
              className="btn btn-square btn-ghost btn-sm"
              type="button"
              aria-label="Close Telegram chat"
              onClick={onClose}>
              <IconX className="size-4" />
            </button>
          }
        />
        {chat.connection !== 'connected' && (
          <p className="text-base-content/55 mt-1 text-xs" role="status">
            {chat.connection === 'updating' ? 'Updating…' : 'Reconnecting…'}
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 p-4">
        <div className="border-base-content/5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border">
          {chat.forum && <TelegramTopics selected={selected} onSelect={onSelect} />}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {chat.forum && (
              <div className="border-base-content/10 border-b px-4 py-2 text-sm font-semibold">
                {topic?.title || 'Loading conversation…'}
              </div>
            )}
            {ready ? (
              <TelegramConversation
                key={`conversation:${selected}`}
                open={open}
                topicId={selected!}
                canRead={open && !media && !blocked && chat.connection === 'connected'}
                canReply={open && !blocked && !closed}
                onReply={message => composer.onChange({ ...draft, replyToId: message.id })}
                onMedia={message =>
                  setMedia({ messageId: message.id, topicId: message.topicId, mediaId: message.attachment?.id })
                }
              />
            ) : (
              <div className="text-base-content/50 flex flex-1 items-center justify-center p-8 text-sm">
                {topics.isSuccess &&
                !topics.hasNextPage &&
                !topics.data.pages.some(page => page.items.some(topic => !topic.hidden))
                  ? 'No available conversations.'
                  : 'Loading conversation…'}
              </div>
            )}
            <TelegramComposer
              key={`composer:${selected}`}
              {...composer}
              draft={draft}
              disabled={!open || !ready || !online || !!closed || blocked}
              canSend={!!canSend}
              replyLabel={reply ? `${senderName(reply)}: ${messageExcerpt(reply)}` : 'unavailable message'}
              notice={notice}
            />
          </div>
        </div>
      </div>
      {open && !!media && <TelegramMediaDialog chat={chat} selection={media} onClose={closeMedia} />}
    </div>
  )
}
