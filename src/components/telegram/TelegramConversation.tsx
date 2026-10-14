import type { ChatMessage } from '../../services/telegram/chat-data'

import { IconArrowDown } from '@tabler/icons-react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  useTelegramHistory,
  useTelegramOutgoing,
  useTelegramRead,
  useTelegramSend,
} from '../../services/telegram/chat-queries'
import { useTelegram } from '../../services/telegram/session-provider'
import { chatError } from '../../utils/telegram-chat'
import { TelegramMessage } from './TelegramMessage'

function useWindowActive() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    let disposed = false
    let nativeFocused = !isTauri()
    const update = () => {
      if (!disposed) setActive(nativeFocused && document.visibilityState === 'visible' && document.hasFocus())
    }
    const focus = () => {
      if (!isTauri()) nativeFocused = true
      update()
    }
    const blur = () => setActive(false)
    window.addEventListener('focus', focus)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', update)
    const unsubscribe = isTauri()
      ? getCurrentWindow().onFocusChanged(({ payload }) => {
          nativeFocused = payload
          update()
        })
      : Promise.resolve(() => {})
    if (isTauri())
      void getCurrentWindow()
        .isFocused()
        .then(value => {
          nativeFocused = value
          update()
        })
        .catch(() => {})
    else update()
    return () => {
      disposed = true
      window.removeEventListener('focus', focus)
      window.removeEventListener('blur', blur)
      document.removeEventListener('visibilitychange', update)
      void unsubscribe.then(fn => fn()).catch(() => {})
    }
  }, [])
  return active
}

export function TelegramConversation({
  open,
  topicId,
  canReply,
  canRead,
  onReply,
  onMedia,
}: {
  open: boolean
  topicId: number | null
  canReply: boolean
  canRead: boolean
  onReply: (message: ChatMessage) => void
  onMedia: (message: ChatMessage) => void
}) {
  const history = useTelegramHistory({ topicId })
  const outgoing = useTelegramOutgoing()
  const send = useTelegramSend()
  const { chat } = useTelegram()
  const read = useTelegramRead()
  const focused = useWindowActive()
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const anchor = useRef<{ id: string; offset: number } | null>(null)
  const confirmed = useRef(0)
  const lastSent = useRef(0)
  const wasLoaded = useRef(false)
  const [away, setAway] = useState(false)
  const [position, setPosition] = useState(0)
  const [refreshed, setRefreshed] = useState(false)
  const messages = useMemo(() => {
    const records = new Map<number, ChatMessage>()
    for (const page of history.data?.pages ?? [])
      for (const record of page.items) if (!records.has(record.view.id)) records.set(record.view.id, record.view)
    return [
      ...[...records.values()].sort((a, b) => a.id - b.id),
      ...(outgoing.data ?? [])
        .filter(item => item.operation.topicId === topicId && (!item.serverId || !records.has(item.serverId)))
        .map(item => item.record.view),
    ]
  }, [history.data, outgoing.data, topicId])

  const capture = useCallback(() => {
    const node = viewport.current
    if (!node) return
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
    setAway(!pinned.current)
    const top = node.getBoundingClientRect().top
    const row = [...node.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      row => row.getBoundingClientRect().bottom > top,
    )
    if (row) anchor.current = { id: row.dataset.messageId!, offset: row.getBoundingClientRect().top - top }
    setPosition(value => value + 1)
  }, [])
  const restore = useCallback(() => {
    const node = viewport.current
    if (!node) return
    if (pinned.current) node.scrollTop = node.scrollHeight
    else if (anchor.current) {
      const row = node.querySelector<HTMLElement>(`[data-message-id="${anchor.current.id}"]`)
      if (row)
        node.scrollTop += row.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.current.offset
      else if (node.querySelector('[data-message-id]')) {
        pinned.current = true
        node.scrollTop = node.scrollHeight
        setRefreshed(true)
      }
    }
    capture()
  }, [capture])
  useLayoutEffect(() => {
    if (!open) return
    pinned.current = true
    anchor.current = null
    restore()
  }, [open, restore])
  useLayoutEffect(() => {
    if (!history.data && wasLoaded.current) {
      pinned.current = true
      anchor.current = null
      setRefreshed(true)
    }
    if (history.data) wasLoaded.current = true
    const newest = Math.min(0, ...messages.map(message => message.id))
    if (newest < lastSent.current) {
      pinned.current = true
      anchor.current = null
      lastSent.current = newest
    }
    restore()
  }, [history.data, messages, restore])
  useEffect(() => {
    const observer = new ResizeObserver(restore)
    if (content.current) observer.observe(content.current)
    if (viewport.current) observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [restore])

  const loadOlder = useCallback(() => {
    if (!open || !history.hasNextPage || history.isFetching) return
    capture()
    void history.fetchNextPage()
  }, [open, history.hasNextPage, history.isFetching, history.fetchNextPage, capture])
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) loadOlder()
      },
      { root: viewport.current },
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [loadOlder])
  useEffect(() => {
    if (!canRead || !focused || away || !messages.length) return
    const timer = window.setTimeout(() => {
      const node = viewport.current
      if (!node || !pinned.current || document.visibilityState !== 'visible' || !document.hasFocus()) return
      const bounds = node.getBoundingClientRect()
      const visible = [...node.querySelectorAll<HTMLElement>('[data-message-id]')].filter(row => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > bounds.top && rect.top < bounds.bottom
      })
      const maxId = Math.max(0, ...visible.map(row => Number(row.dataset.messageId)))
      if (maxId <= confirmed.current) return
      read.mutate(
        { topicId, maxId },
        {
          onSuccess: () => {
            confirmed.current = Math.max(confirmed.current, maxId)
          },
        },
      )
    }, 600)
    return () => window.clearTimeout(timer)
  }, [canRead, focused, away, messages, position, topicId, read.mutate])

  const latest = () => {
    pinned.current = true
    restore()
  }
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewport}
        className="h-full overflow-y-auto overscroll-contain [overflow-anchor:none]"
        onScroll={capture}>
        <div ref={content} className="min-h-full pb-4">
          <div ref={sentinel} className="h-px" />
          {history.hasNextPage && (
            <div className="p-2 text-center">
              <button className="btn btn-ghost btn-xs" type="button" disabled={history.isFetching} onClick={loadOlder}>
                {history.isFetchingNextPage ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {history.isError && (
            <div className="space-y-2 p-4 text-center">
              <p className="text-error text-sm" role="alert">
                {chatError(history.error)}
              </p>
              <button
                className="btn btn-sm"
                type="button"
                disabled={history.isFetching}
                onClick={() => void history.refetch()}>
                Retry
              </button>
            </div>
          )}
          {history.isPending && (
            <div className="flex justify-center p-12">
              <span className="loading loading-spinner loading-sm" aria-label="Loading messages" />
            </div>
          )}
          {history.isSuccess && !messages.length && (
            <p className="text-base-content/50 p-12 text-center text-sm">No messages yet.</p>
          )}
          {refreshed && (
            <p className="text-base-content/50 p-2 text-center text-xs" role="status">
              Conversation refreshed
            </p>
          )}
          {messages.map((message, index) => (
            <Fragment key={message.id}>
              {(!index ||
                new Date(message.date * 1000).toDateString() !==
                  new Date(messages[index - 1].date * 1000).toDateString()) && (
                <div className="text-base-content/45 my-3 flex items-center gap-3 px-4 text-[11px]">
                  <span className="border-base-content/10 flex-1 border-t" />
                  {new Date(message.date * 1000).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  <span className="border-base-content/10 flex-1 border-t" />
                </div>
              )}
              <TelegramMessage
                message={message}
                outgoing={outgoing.data?.find(item => item.record.view.id === message.id)}
                canReply={canReply && message.id > 0}
                canRetry={open && canReply && !!chat?.isReady && ['connected', 'updating'].includes(chat.connection)}
                onRetry={operation => send.mutate({ operation })}
                onDismiss={operation => chat?.cache.dismissSend(operation.id)}
                onCancel={operation => chat?.cancel(operation.id)}
                onReply={() => onReply(message)}
                onMedia={() => onMedia(message)}
                onJump={id => {
                  viewport.current?.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ block: 'center' })
                }}
              />
            </Fragment>
          ))}
        </div>
      </div>
      {away && (
        <button className="btn btn-primary btn-sm absolute right-4 bottom-3 shadow-lg" type="button" onClick={latest}>
          <IconArrowDown className="size-4" />
          Latest messages
        </button>
      )}
    </div>
  )
}
