import type { Topic } from '../../services/telegram/chat-data'

import { IconHash, IconLock } from '@tabler/icons-react'
import { useEffect, useMemo } from 'react'

import { TelegramChatError } from '../../services/telegram/chat'
import { useTelegramTopic, useTelegramTopics } from '../../services/telegram/chat-queries'
import { cx } from '../../utils/cx'
import { chatError } from '../../utils/telegram-chat'

export function TelegramTopics({
  selected,
  onSelect,
}: {
  selected: number | null | undefined
  onSelect: (id: number) => void
}) {
  const topics = useTelegramTopics()
  const items = useMemo(() => {
    const records = new Map<number, Topic>()
    for (const page of topics.data?.pages ?? [])
      for (const topic of page.items) if (!records.has(topic.id)) records.set(topic.id, topic)
    return [...records.values()]
  }, [topics.data])
  const selectedInPages = useMemo(() => items.find(item => item.id === selected), [items, selected])
  const lookup = useTelegramTopic(selected ?? null, !!topics.data && !selectedInPages)
  const remembered = selectedInPages ?? lookup.data
  const visible = useMemo(() => items.filter(item => !item.hidden), [items])
  const deleted =
    (lookup.isSuccess && lookup.data === null) ||
    (lookup.error instanceof TelegramChatError && lookup.error.category === 'restricted')
  const choose = selected === undefined || selected === null || remembered?.hidden || (!selectedInPages && deleted)
  useEffect(() => {
    if (choose && visible[0]) onSelect(visible[0].id)
  }, [choose, visible, onSelect])
  return (
    <nav
      className="border-base-content/10 bg-base-200/30 min-h-0 w-44 min-w-0 shrink-0 overflow-x-hidden overflow-y-auto overscroll-contain border-r p-2"
      aria-label="Telegram topics">
      <p className="text-base-content/50 px-2 py-2 text-xs font-semibold tracking-wide uppercase">Topics</p>
      <ul className="menu w-full max-w-full min-w-0 gap-1 p-0">
        {!!remembered && !remembered.hidden && !selectedInPages && (
          <TopicButton topic={remembered} selected={selected === remembered.id} onSelect={onSelect} />
        )}
        {visible.map(topic => (
          <TopicButton key={topic.id} topic={topic} selected={selected === topic.id} onSelect={onSelect} />
        ))}
      </ul>
      {(topics.isPending || topics.isFetchingNextPage) && (
        <div className="p-3 text-center">
          <span className="loading loading-spinner loading-sm" aria-label="Loading topics" />
        </div>
      )}
      {topics.isSuccess && !visible.length && !topics.hasNextPage && (
        <p className="text-base-content/60 p-2 text-xs">No available topics.</p>
      )}
      {(topics.isError || lookup.isError) && (
        <div className="space-y-2 p-2">
          <p className="text-error text-xs" role="alert">
            {chatError(topics.error ?? lookup.error)}
          </p>
          <button
            className="btn btn-xs"
            type="button"
            onClick={() => {
              void topics.refetch()
              if (lookup.isError) void lookup.refetch()
            }}>
            Retry
          </button>
        </div>
      )}
    </nav>
  )
}

function TopicButton({
  topic,
  selected,
  onSelect,
}: {
  topic: Topic
  selected: boolean
  onSelect: (id: number) => void
}) {
  return (
    <li className="max-w-full min-w-0">
      <button
        type="button"
        className={cx('flex w-full max-w-full min-w-0 gap-2 text-left', selected && 'menu-active')}
        aria-current={selected ? 'page' : undefined}
        onClick={() => onSelect(topic.id)}
        title={topic.title}>
        {topic.closed ? <IconLock className="size-3.5" /> : <IconHash className="size-3.5" />}
        <span className="min-w-0 flex-1 truncate text-xs">{topic.title}</span>
        {topic.unreadCount > 0 && <span className="badge badge-primary badge-xs">{topic.unreadCount}</span>}
      </button>
    </li>
  )
}
