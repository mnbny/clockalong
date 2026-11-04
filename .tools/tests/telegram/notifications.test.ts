import type {
  ChatMessage,
  MessageRecord,
  NotificationHistoryPage,
  TelegramMessageEvent,
} from '../../../src/services/telegram/chat-data'

import { afterEach, expect, test, vi } from 'vitest'

import { DB } from '../../../src/services/db'
import { TelegramNotificationCollector } from '../../../src/services/telegram/notification-collector'
import { groupTelegramNotifications } from '../../../src/services/telegram/notification-groups'
import { notificationReply } from '../../../src/services/telegram/notification-reply'
import { eligibleNotification, TelegramNotificationStore } from '../../../src/services/telegram/notification-store'
import { deferred } from './fixtures'

const databases: DB[] = []
const collectors: TelegramNotificationCollector[] = []
afterEach(async () => {
  collectors.splice(0).forEach(collector => collector.stop())
  await Promise.all(databases.splice(0).map(database => database.delete()))
})
function fixture(scope = '1:supergroup:123') {
  const database = new DB(`notifications-${crypto.randomUUID()}`)
  databases.push(database)
  return { database, store: new TelegramNotificationStore(database, scope, '1') }
}
function message(id: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    date: 100 + id,
    topicId: 1,
    text: `Message ${id}`,
    entities: [],
    outgoing: false,
    mentioned: false,
    protected: false,
    replyOutsideGroup: false,
    attachment: null,
    sender: { id: '2', kind: 'user', name: 'Other account', deleted: false, minimal: false },
    ...extra,
  }
}
const record = (id: number, extra: Partial<ChatMessage> = {}): MessageRecord => ({ view: message(id, extra) })
const items = (...ids: number[]) => ids.map(id => ({ message: message(id) }))
test('reply reads reuse cleared parent notifications and respect source deletion', async () => {
  const { store } = fixture()
  await store.merge([
    { message: message(1, { text: 'Original\n  message' }) },
    { message: message(2, { replyToId: 1 }) },
  ])
  await store.clear(1)
  const row = (await store.visible())[0]
  const fetchNotificationMessages = vi.fn()
  const chat = { isReady: true, notificationScope: store.scope, fetchNotificationMessages }
  expect(await notificationReply(row, store, chat, new AbortController().signal)).toEqual(
    message(1, { text: 'Original\n  message' }),
  )
  await store.removeSources([1])
  expect(await notificationReply(row, store, chat, new AbortController().signal)).toBeNull()
  expect(fetchNotificationMessages).not.toHaveBeenCalled()
})

test('reply fetching supports own messages without creating notifications and stays in the selected group', async () => {
  const { store, database } = fixture()
  await store.merge([{ message: message(2, { replyToId: 1 }) }])
  const row = (await store.visible())[0]
  const fetchNotificationMessages = vi.fn(async () => [
    record(1, {
      text: 'x'.repeat(200),
      outgoing: true,
      sender: { id: '1', kind: 'user', name: 'Me', deleted: false, minimal: false },
    }),
  ])
  const chat = { isReady: true, notificationScope: store.scope, fetchNotificationMessages }
  const signal = new AbortController().signal
  expect(await notificationReply(row, store, chat, signal)).toMatchObject({
    sender: { name: 'Me' },
    text: 'x'.repeat(200),
  })
  expect(fetchNotificationMessages).toHaveBeenCalledWith([1], signal)
  expect(await database.telegramNotifications.count()).toBe(1)
  expect(
    await notificationReply({ ...row, message: { ...row.message, replyOutsideGroup: true } }, store, chat, signal),
  ).toBeNull()
  expect(await notificationReply(row, store, { ...chat, notificationScope: 'different' }, signal)).toBeNull()
  expect(fetchNotificationMessages).toHaveBeenCalledTimes(1)
})

test('albums group only within their scope and topic; clearing an album preserves other arrivals', async () => {
  const { store } = fixture()
  await store.merge([
    { message: message(1, { groupedId: 'album' }) },
    { message: message(2, { groupedId: 'album' }) },
    { message: message(3, { groupedId: 'album', topicId: 9 }) },
    { message: message(4) },
  ])
  const rows = await store.visible()
  expect(groupTelegramNotifications(rows).map(group => group.map(row => row.id))).toEqual([[4], [3], [2, 1]])
  const otherScope = { ...rows[3], scope: '2:supergroup:123' }
  expect(groupTelegramNotifications([rows[3], otherScope])).toHaveLength(2)
  await store.clear([1, 2])
  expect((await store.visible()).map(row => row.id)).toEqual([4, 3])
  await store.merge(items(1, 2))
  expect((await store.visible()).map(row => row.id)).toEqual([4, 3])
})
const page = (records: MessageRecord[], nextId?: number): NotificationHistoryPage => ({
  items: records,
  newestId: Math.max(0, ...records.map(row => row.view.id)),
  nextBefore: nextId === undefined ? undefined : { id: nextId, date: 100 },
})
function sourceFixture(store: TelegramNotificationStore) {
  const listeners = new Set<(event: TelegramMessageEvent) => void>()
  const source = {
    accountId: '1',
    signal: new AbortController().signal,
    subscribeMessages: (listener: (event: TelegramMessageEvent) => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    fetchNotificationHistory: vi
      .fn<(before: { id: number; date: number } | null) => Promise<NotificationHistoryPage>>()
      .mockResolvedValue(page([])),
    fetchNotificationMessages: vi.fn(async (ids: number[]) => ids.map(id => record(id))),
    fetchTopic: vi.fn(async (id: number) => ({
      id,
      title: `Topic ${id}`,
      date: 100,
      closed: false,
      hidden: false,
      pinned: false,
      topMessage: 0,
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      unreadMentionsCount: 0,
    })),
  }
  const collector = new TelegramNotificationCollector(source, store)
  collectors.push(collector)
  return { source, collector, emit: (event: TelegramMessageEvent) => listeners.forEach(listener => listener(event)) }
}

test('only other-account ordinary messages qualify, including protection against own-account agent sends', async () => {
  const { store } = fixture()
  const own = { id: '1', kind: 'user' as const, name: 'Me', deleted: false, minimal: false }
  const candidates = [
    message(1),
    message(2, { outgoing: true }),
    message(3, { sender: own }),
    message(4, { service: 'messageActionChatAddUser' }),
    message(5, { sender: null }),
  ]
  expect(candidates.map(item => eligibleNotification(item, '1'))).toEqual([true, false, false, false, false])
  await store.merge(candidates.map(message => ({ message })))
  expect((await store.visible()).map(row => row.id)).toEqual([1])
})

test('cleared identity survives reopening, replay, and edits without changing collection checkpoint', async () => {
  const { database, store } = fixture()
  await store.merge(items(8, 9), { checkpoint: 10 })
  await store.clear(9)
  database.close()
  await database.open()
  await store.merge([{ message: message(9, { text: 'Edited', editDate: 500 }) }])
  expect((await store.visible()).map(row => row.id)).toEqual([8])
  expect(await store.checkpoint()).toEqual({ scope: store.scope, lastMessageId: 10 })
  expect(await database.telegramNotifications.get([store.scope, 9])).toMatchObject({ message: { text: 'Edited' } })
})

test('Clear all is scoped and atomic; arrivals queued afterward remain visible', async () => {
  const { database, store } = fixture()
  const otherGroup = new TelegramNotificationStore(database, '1:supergroup:999', '1')
  const otherAccount = new TelegramNotificationStore(database, '9:supergroup:123', '9')
  await store.merge(items(1, 2))
  await otherGroup.merge(items(1))
  await otherAccount.merge(items(1))
  const clearing = store.clear()
  const arrival = store.merge(items(3))
  await Promise.all([clearing, arrival])
  expect((await store.visible()).map(row => row.id)).toEqual([3])
  expect(await otherGroup.visible()).toHaveLength(1)
  expect(await otherAccount.visible()).toHaveLength(1)
})

test('deleted cards remain until cleared and stale history cannot restore their body', async () => {
  const { database, store } = fixture()
  await store.merge(items(8))
  await store.removeSources([8, 999])
  await store.merge([{ message: message(8, { text: 'Stale', editDate: 500 }) }])
  expect(await store.visible()).toMatchObject([{ deleted: true, message: { text: '' } }])
  await store.clear(8)
  await store.merge(items(8))
  expect(await store.visible()).toEqual([])
  expect(await database.telegramNotifications.count()).toBe(1)
})

test('development replay is scoped to a reload token and preserves production clear tombstones', async () => {
  const { store } = fixture()
  await store.merge(items(1, 2, 3), { checkpoint: 3 })
  await store.clear()
  await store.merge(items(1, 2, 3), { onlyExisting: true, devReplayRun: 'reload-a', replayIds: [1, 2, 3] })
  expect(await store.visible()).toEqual([])
  expect(await store.visible('reload-a')).toHaveLength(3)
  await store.clear(3, 'reload-a')
  await store.merge(items(1, 2, 3), { onlyExisting: true, devReplayRun: 'reload-a', replayIds: [1, 2, 3] })
  expect((await store.visible('reload-a')).map(row => row.id)).toEqual([2, 1])
  expect(await store.visible('reload-b')).toEqual([])
  await store.merge(items(1, 2, 3), { onlyExisting: true, devReplayRun: 'reload-b', replayIds: [1, 2, 3] })
  expect(await store.visible('reload-b')).toHaveLength(3)
  expect(await store.visible()).toEqual([])
})

test('initial scan finds last three eligible messages across pages and topics, checkpoint includes own messages', async () => {
  const { store } = fixture()
  const { source, collector } = sourceFixture(store)
  source.fetchNotificationHistory
    .mockResolvedValueOnce(page([record(20, { outgoing: true }), record(19), record(18, { outgoing: true })], 18))
    .mockResolvedValueOnce(page([record(17, { topicId: 8 }), record(16, { topicId: 9 }), record(15)], 15))
  await collector.collect()
  expect((await store.visible()).map(row => row.id)).toEqual([19, 17, 16])
  expect((await store.checkpoint())?.lastMessageId).toBe(20)
  expect(source.fetchNotificationHistory).toHaveBeenNthCalledWith(2, { id: 18, date: 100 }, expect.any(AbortSignal))
  expect(source.fetchTopic).toHaveBeenCalledWith(8, expect.any(AbortSignal))
})

test('failed catch-up does not commit partial pages or advance checkpoint; retry collects the entire gap', async () => {
  const { store } = fixture()
  await store.merge(items(1), { checkpoint: 1 })
  const { source, collector } = sourceFixture(store)
  source.fetchNotificationHistory
    .mockResolvedValueOnce(page([record(5), record(4)], 4))
    .mockRejectedValueOnce(new Error('offline'))
  await expect(collector.collect()).rejects.toThrow('offline')
  expect((await store.checkpoint())?.lastMessageId).toBe(1)
  expect((await store.visible()).map(row => row.id)).toEqual([1])
  source.fetchNotificationHistory
    .mockResolvedValueOnce(page([record(5), record(4)], 4))
    .mockResolvedValueOnce(page([record(3), record(2), record(1)], 1))
  await collector.collect()
  expect((await store.visible()).map(row => row.id)).toEqual([5, 4, 3, 2, 1])
  expect((await store.checkpoint())?.lastMessageId).toBe(5)
})

test('live arrival during catch-up never advances past missed backlog; old edits cannot create notifications', async () => {
  const { store } = fixture()
  await store.merge(items(1), { checkpoint: 1 })
  const { source, collector, emit } = sourceFixture(store)
  const pending = deferred<NotificationHistoryPage>()
  source.fetchNotificationHistory
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(page([record(3), record(2), record(1)], 1))
  collector.start()
  await vi.waitFor(() => expect(source.fetchNotificationHistory).toHaveBeenCalledTimes(1))
  emit({ type: 'message', record: record(6), edited: false })
  emit({ type: 'message', record: record(99, { editDate: 500 }), edited: true })
  pending.resolve(page([record(5), record(4)], 4))
  await vi.waitFor(async () => expect((await store.visible()).map(row => row.id)).toEqual([6, 5, 4, 3, 2, 1]))
  expect((await store.checkpoint())?.lastMessageId).toBe(5)
})

test('catch-up revalidates saved cards: edits update content, source deletion does not dismiss', async () => {
  const { store } = fixture()
  await store.merge(items(1, 2), { checkpoint: 2 })
  const { source, collector } = sourceFixture(store)
  source.fetchNotificationMessages.mockResolvedValue([record(2, { text: 'Updated', editDate: 500 })])
  await collector.collect()
  expect(await store.visible()).toMatchObject([
    { id: 2, deleted: false, message: { text: 'Updated' } },
    { id: 1, deleted: true },
  ])
})

test('scope disposal during a history read prevents any persistence', async () => {
  const { database, store } = fixture()
  const { source, collector } = sourceFixture(store)
  const pending = deferred<NotificationHistoryPage>()
  source.fetchNotificationHistory.mockReturnValueOnce(pending.promise)
  const collecting = collector.collect()
  await vi.waitFor(() => expect(source.fetchNotificationHistory).toHaveBeenCalled())
  collector.stop()
  pending.resolve(page([record(3), record(2), record(1)]))
  await expect(collecting).rejects.toThrow()
  expect(await database.telegramNotifications.count()).toBe(0)
  expect(await store.checkpoint()).toBeUndefined()
})

test('reconnect during routine collection requests revalidation and a failed refresh stays pending', async () => {
  const { store } = fixture()
  await store.merge(items(1), { checkpoint: 1 })
  const { source, collector } = sourceFixture(store)
  const pending = deferred<NotificationHistoryPage>()
  source.fetchNotificationHistory.mockReturnValueOnce(pending.promise)
  source.fetchNotificationMessages.mockRejectedValueOnce(new Error('offline'))
  const routine = collector.collect(false)
  await vi.waitFor(() => expect(source.fetchNotificationHistory).toHaveBeenCalled())
  const reconnect = collector.collect()
  pending.resolve(page([]))
  await expect(routine).rejects.toThrow('offline')
  await expect(reconnect).rejects.toThrow('offline')
  source.fetchNotificationMessages.mockResolvedValueOnce([record(1, { editDate: 900, text: 'Recovered edit' })])
  await collector.collect(false)
  expect((await store.visible())[0].message.text).toBe('Recovered edit')
  expect(source.fetchNotificationMessages).toHaveBeenCalledTimes(2)
  await collector.collect(false)
  expect(source.fetchNotificationMessages).toHaveBeenCalledTimes(2)
})

test('a reconnect during card revalidation receives a further refresh pass', async () => {
  const { store } = fixture()
  await store.merge(items(1), { checkpoint: 1 })
  const { source, collector } = sourceFixture(store)
  const pending = deferred<MessageRecord[]>()
  source.fetchNotificationMessages.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([])
  const initial = collector.collect()
  await vi.waitFor(() => expect(source.fetchNotificationMessages).toHaveBeenCalledTimes(1))
  const reconnect = collector.collect()
  pending.resolve([record(1)])
  await Promise.all([initial, reconnect])
  expect(source.fetchNotificationMessages).toHaveBeenCalledTimes(2)
  expect(await store.visible()).toMatchObject([{ id: 1, deleted: true }])
})
