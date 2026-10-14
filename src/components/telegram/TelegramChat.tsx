import type { TelegramChat as ChatService } from '../../services/telegram/chat'

import { useFocusReturn } from '@mantine/hooks'
import { IconBrandTelegram } from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAppAuth } from '../../hooks/useAppAuth'
import { photoMime } from '../../services/telegram/chat-files'
import {
  useTelegramChatPreload,
  useTelegramSend,
  useTelegramSummary,
  useTelegramTopics,
} from '../../services/telegram/chat-queries'
import { useTelegram } from '../../services/telegram/session-provider'
import { type ChatDraft, chatError, chatUnreadCount, emptyDraft } from '../../utils/telegram-chat'
import { TelegramChatPanel } from './TelegramChatPanel'

export function TelegramChat() {
  const auth = useAppAuth()
  const telegram = useTelegram()
  if (!auth.value.telegramAuthenticated || !telegram.chat) return null
  return <ChatLifetime key={telegram.chat.scope} chat={telegram.chat} />
}

function ChatLifetime({ chat }: { chat: ChatService }) {
  const telegram = useTelegram()
  const dashboard = useRouterState({ select: state => state.location.pathname === '/dashboard' })
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number | null | undefined>(chat.forum ? undefined : null)
  const [drafts, setDrafts] = useState<Record<string, ChatDraft>>({})
  const [error, setError] = useState('')
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const picking = useRef(false)
  const live = useRef(true)
  const send = useTelegramSend(operation => {
    setDrafts(values => {
      const next = { ...values }
      delete next[String(operation.topicId)]
      return next
    })
    setError('')
  })
  const available = telegram.group.status === 'connected' && chat.isReady
  useTelegramChatPreload(dashboard && available)
  useFocusReturn({ opened: open && dashboard && available, shouldReturnFocus: dashboard && available })
  useEffect(() => {
    if (!open || !dashboard || !available) return
    const main = document.querySelector('main')
    if (!main) return
    const wasInert = main.inert
    main.inert = true
    return () => {
      main.inert = wasInert
    }
  }, [open, dashboard, available])
  useEffect(() => {
    setSlot(document.getElementById('telegram-chat-launcher'))
  }, [])
  useEffect(() => {
    if (!dashboard) setOpen(false)
  }, [dashboard])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      for (const item of chat.cache.outgoing()) chat.cancel(item.operation.id)
    }
  }, [chat])
  const select = useCallback((id: number) => {
    setSelected(id)
    setError('')
  }, [])
  const close = useCallback(() => setOpen(false), [])
  const draft = drafts[String(selected ?? null)] ?? emptyDraft
  const changeDraft = (next: ChatDraft) => {
    if (selected === undefined) return
    setDrafts(values => ({ ...values, [String(selected)]: next }))
    setError('')
  }
  const files = async (files: File[], folder = false) => {
    if (
      !chat.isReady ||
      telegram.busy ||
      ['offline', 'connecting'].includes(chat.connection) ||
      (selected && chat.cache.topic(selected)?.closed && !chat.cache.summary()?.canSendInClosedTopics)
    ) {
      setError('Attachments cannot be added right now.')
      return
    }
    if (picking.current) {
      setError('Wait for the current attachment.')
      return
    }
    if (folder) {
      setError('Choose a file, not a folder.')
      return
    }
    if (files.length !== 1) {
      if (files.length) setError('Choose one file at a time.')
      return
    }
    if (draft.attachment) {
      setError('Remove the selected file before choosing another.')
      return
    }
    if (selected === undefined) {
      setError('Wait for the conversation to load.')
      return
    }
    const file = files[0]
    const topicId = selected
    picking.current = true
    try {
      const prefix = new Uint8Array(await file.slice(0, 32).arrayBuffer())
      if (!live.current || chat.signal.aborted) return
      const eligible = photoMime(prefix) === file.type
      setDrafts(values => {
        const current = values[String(topicId)] ?? emptyDraft
        if (current.attachment) return values
        return {
          ...values,
          [String(topicId)]: {
            ...current,
            attachment: {
              source: file,
              name: file.name || 'attachment',
              mime: file.type,
              mode: eligible ? 'media' : 'original',
              mediaEligible: eligible,
            },
          },
        }
      })
      setError('')
    } catch {
      if (live.current) setError('Could not read this file. Try the file picker.')
    } finally {
      picking.current = false
    }
  }
  const submit = () => {
    if (
      picking.current ||
      selected === undefined ||
      !chat.isReady ||
      telegram.busy ||
      (!draft.text.trim() && !draft.attachment)
    )
      return
    let operation
    try {
      operation = chat.createSend({ topicId: selected, text: draft.text, replyToId: draft.replyToId }, draft.attachment)
    } catch (error) {
      setError(chatError(error))
      return
    }
    send.mutate({ operation })
  }

  if (!dashboard) return null
  if (!available)
    return (
      open &&
      createPortal(
        <div className="alert alert-error fixed right-6 bottom-6 z-50 max-w-md text-sm">
          <span>{telegram.group.error || 'Telegram is unavailable.'}</span>
          <Link to="/settings" className="btn btn-sm" onClick={close}>
            Settings
          </Link>
          <button className="btn btn-ghost btn-sm" type="button" onClick={close}>
            Dismiss
          </button>
        </div>,
        document.body,
      )
    )
  return (
    <>
      {!!slot && createPortal(<ChatLauncher open={open} disabled={telegram.busy} onOpen={() => setOpen(true)} />, slot)}
      {createPortal(
        <TelegramChatPanel
          open={open}
          chat={chat}
          title={telegram.group.group?.title || 'Telegram'}
          selected={selected}
          onSelect={select}
          onClose={close}
          draft={draft}
          blocked={telegram.busy}
          onFiles={(selectedFiles, folder) => void files(selectedFiles, folder)}
          onDropError={setError}
          composer={{
            error,
            onChange: changeDraft,
            onFiles: selectedFiles => void files(selectedFiles),
            onSend: submit,
          }}
        />,
        document.body,
      )}
    </>
  )
}

function ChatLauncher({ open, disabled, onOpen }: { open: boolean; disabled: boolean; onOpen: () => void }) {
  const { chat } = useTelegram()
  const summary = useTelegramSummary()
  const topics = useTelegramTopics()
  const unread = useMemo(
    () => chatUnreadCount(!!chat?.forum, summary.data, topics.data?.pages) ?? 0,
    [chat?.forum, summary.data, topics.data],
  )
  return (
    <button
      className="btn btn-square btn-ghost relative"
      type="button"
      aria-label={`Telegram chat${unread ? `, ${unread} unread` : ''}`}
      title="Telegram chat"
      aria-expanded={open}
      disabled={disabled}
      onClick={onOpen}>
      <IconBrandTelegram className="size-5" />
      {unread > 0 && (
        <span className="badge badge-primary badge-xs absolute top-1 right-0 min-w-4 px-1">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
