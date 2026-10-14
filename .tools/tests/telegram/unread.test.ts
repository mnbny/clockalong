import type { Topic, TopicPage } from '../../../src/services/telegram/chat-data'

import { expect, test } from 'vitest'

import { chatUnreadCount } from '../../../src/utils/telegram-chat'

const topic = (id: number, unreadCount: number, hidden = false): Topic => ({
  id,
  unreadCount,
  hidden,
  title: 'Topic',
  date: 0,
  closed: false,
  pinned: false,
  topMessage: 10,
  readInboxMaxId: 10,
  readOutboxMaxId: 10,
  unreadMentionsCount: 0,
})
const page = (...items: Topic[]): TopicPage => ({ items, serverCount: items.length })

test('the forum badge clears when topics are read even if the group counter remains unread', () => {
  const summary = { unreadCount: 1 }
  expect(chatUnreadCount(true, summary, [page(topic(1, 0), topic(4, 2))])).toBe(2)
  expect(chatUnreadCount(true, summary, [page(topic(1, 0), topic(4, 0))])).toBe(0)
})

test('the forum badge follows visible sidebar topics without counting page overlap twice', () => {
  expect(
    chatUnreadCount(true, { unreadCount: 99 }, [
      page(topic(1, 2), topic(4, 3)),
      page(topic(4, 3), topic(8, 1), topic(9, 7, true)),
    ]),
  ).toBe(6)
})

test('the forum badge waits for complete topic pagination instead of falling back to the group counter', () => {
  const summary = { unreadCount: 1 }
  expect(chatUnreadCount(true, summary, undefined)).toBeUndefined()
  expect(
    chatUnreadCount(true, summary, [{ ...page(topic(1, 0)), nextOffset: { id: 10, date: 0, topic: 1 } }]),
  ).toBeUndefined()
})

test('groups without topics use their group unread counter', () => {
  expect(chatUnreadCount(false, { unreadCount: 3 }, undefined)).toBe(3)
  expect(chatUnreadCount(false, { unreadCount: 0 }, undefined)).toBe(0)
})
