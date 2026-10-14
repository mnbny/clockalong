import type { HistoryCursor, HistoryPage, TopicCursor, TopicPage } from '../../../src/services/telegram/chat-data'
import type { SavedTelegramGroup } from '../../../src/services/telegram/group'

import {
  type BaseTelegramClient,
  type ConnectionState,
  Long,
  PeersIndex,
  type RawUpdateInfo,
  type RpcCallOptions,
  tl,
} from '@mtcute/web'
import { type InfiniteData, InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import { expect, onTestFinished, test } from 'vitest'

import { queryKeys } from '../../../src/lib/query-client'
import { TelegramChat } from '../../../src/services/telegram/chat'
import { projectMessage, topicFor } from '../../../src/services/telegram/chat-data'
import { telegramReadOptions, telegramSendOptions } from '../../../src/services/telegram/chat-queries'
import { subscribeChatUpdates } from '../../../src/services/telegram/chat-updates'
import { deferred } from './fixtures'

const basic: SavedTelegramGroup = { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Group' }
const forum: SavedTelegramGroup = { ...basic, kind: 'supergroup', accessHash: '9', forum: true }
const chatRaw: tl.RawChat = {
  _: 'chat',
  id: 123,
  title: 'Group',
  photo: { _: 'chatPhotoEmpty' },
  participantsCount: 2,
  date: 0,
  version: 1,
}
const user: tl.RawUser = { _: 'user', id: 1, firstName: 'One', accessHash: Long.ONE }
const message = (id: number, extra: Partial<tl.RawMessage> = {}): tl.RawMessage => ({
  _: 'message',
  id,
  peerId: { _: 'peerChat', chatId: 123 },
  fromId: { _: 'peerUser', userId: 1 },
  date: 100,
  message: `m${id}`,
  ...extra,
})
const peers = () =>
  PeersIndex.from({
    users: [user, { _: 'user', id: 999, firstName: 'UNRELATED' }],
    chats: [chatRaw, { ...chatRaw, id: 999, title: 'UNRELATED' }],
  })
const record = (id: number, extra: Partial<tl.RawMessage> = {}) => projectMessage(basic, message(id, extra), peers())!
const page = (...ids: number[]): HistoryPage => ({
  items: ids.map(id => record(id)),
  nextBefore: { id: ids[ids.length - 1], date: 100 },
})
const tick = () => new Promise(resolve => setImmediate(resolve))
function emitter<T>() {
  const handlers = new Set<(value: T) => void>()
  return {
    add: (fn: (value: T) => void) => handlers.add(fn),
    remove: (fn: (value: T) => void) => handlers.delete(fn),
    emit: (value: T) => {
      for (const fn of handlers) fn(value)
    },
    get size() {
      return handlers.size
    },
  }
}
function fixture(
  group: SavedTelegramGroup = basic,
  call: (request: tl.RpcMethod, options?: RpcCallOptions) => Promise<unknown> = async request => {
    throw new Error(`Unexpected ${request._}`)
  },
) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const calls: tl.RpcMethod[] = []
  const client = {
    call: async (request: tl.RpcMethod, options?: RpcCallOptions) => {
      calls.push(request)
      return call(request, options)
    },
    onRawUpdate: emitter<RawUpdateInfo>(),
    onConnectionState: emitter<ConnectionState>(),
    notifyChannelClosed: async () => true,
    startUpdatesLoop: async () => {},
    stopUpdatesLoop: async () => {},
    timers: { cancel: async () => {} },
    storage: {
      self: { getCached: () => ({ userId: 1 }) },
      peers: {
        getCompleteById: async (id: number) =>
          id === 1
            ? user
            : group.kind === 'basic'
              ? chatRaw
              : { _: 'channel', id: 123, title: 'Group', forum: group.forum, accessHash: Long.ONE },
      },
    },
    handleClientUpdate() {},
  }
  const sdk = client as unknown as BaseTelegramClient
  const chat = new TelegramChat(sdk, group, query)
  onTestFinished(async () => {
    await chat.dispose()
    query.clear()
  })
  return { query, client, sdk, calls, chat }
}

test('projection rejects another peer and retains no SDK peers or unrelated entries', () => {
  const projected = record(3)
  expect(projected.view.sender?.name).toBe('One')
  expect(JSON.stringify(projected).includes('UNRELATED')).toBe(false)
  expect(projectMessage(basic, message(3, { peerId: { _: 'peerChannel', channelId: 123 } }), peers())).toBe(null)
  expect('raw' in projected).toBe(false)
})
test('forum routing distinguishes General ordinary replies, explicit topics, and creation', () => {
  expect(topicFor(forum, message(8, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 7 } }))).toBe(1)
  expect(
    topicFor(
      forum,
      message(8, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 7, forumTopic: true, replyToTopId: 4 } }),
    ),
  ).toBe(4)
  expect(
    topicFor(forum, {
      ...message(8),
      _: 'messageService',
      action: { _: 'messageActionTopicCreate', title: 'Topic', iconColor: 0 },
    }),
  ).toBe(8)
})
test.each([{ topId: undefined }, { topId: 4 }])(
  'forum membership is not a reply preview (top ID: $topId)',
  ({ topId }) => {
    const raw = message(8, {
      peerId: { _: 'peerChannel', channelId: 123 },
      replyTo: { _: 'messageReplyHeader', forumTopic: true, replyToMsgId: 4, replyToTopId: topId },
    })
    expect(projectMessage(forum, raw, peers())?.view).toMatchObject({ topicId: 4, replyToId: undefined })
  },
)
test('actual replies survive topic projection, including General and external message IDs', () => {
  const project = (replyTo: tl.RawMessageReplyHeader) =>
    projectMessage(forum, message(8, { peerId: { _: 'peerChannel', channelId: 123 }, replyTo }), peers())?.view
  expect(project({ _: 'messageReplyHeader', forumTopic: true, replyToMsgId: 7, replyToTopId: 4 })).toMatchObject({
    topicId: 4,
    replyToId: 7,
    replyOutsideGroup: false,
  })
  expect(project({ _: 'messageReplyHeader', replyToMsgId: 1 })).toMatchObject({ topicId: 1, replyToId: 1 })
  expect(
    project({
      _: 'messageReplyHeader',
      forumTopic: true,
      replyToMsgId: 4,
      replyToTopId: 4,
      replyToPeerId: { _: 'peerChat', chatId: 999 },
    }),
  ).toMatchObject({ topicId: 4, replyToId: 4, replyOutsideGroup: true })
})
test('group-level protection prevents attachment and thumbnail downloads', () => {
  const media: tl.RawMessageMediaPhoto = {
    _: 'messageMediaPhoto',
    photo: {
      _: 'photo',
      id: Long.ONE,
      accessHash: Long.ONE,
      dcId: 1,
      date: 0,
      fileReference: new Uint8Array(),
      sizes: [{ _: 'photoSize', type: 's', w: 10, h: 10, size: 100 }],
    },
  }
  const protectedPeers = PeersIndex.from({ users: [user], chats: [{ ...chatRaw, noforwards: true }] })
  const result = projectMessage(basic, message(4, { media }), protectedPeers)
  expect(result?.view.protected).toBe(true)
  expect(result?.view.attachment?.downloadable).toBe(false)
  expect(result?.file).toBe(undefined)
  expect(result?.preview).toBe(undefined)
})
test('history cursor uses last raw ID exclusive, including short pages, without read side effects', async () => {
  const f = fixture(basic, async () => ({
    _: 'messages.messagesSlice',
    count: 200,
    inexact: true,
    messages: [message(90), message(37)],
    users: [user],
    chats: [chatRaw],
  }))
  const result = await f.chat.fetchHistory({ topicId: null }, { id: 100, date: 101 })
  expect(f.calls[0]).toMatchObject({ _: 'messages.getHistory', offsetId: 100 })
  expect(result.nextBefore).toStrictEqual({ id: 37, date: 100 })
  expect(result.countExact).toBe(false)
  expect(f.calls.length).toBe(1)
  await f.chat.dispose()
})
test('General uses getReplies, including empty-page termination', async () => {
  const f = fixture(forum, async () => ({ _: 'messages.messages', messages: [], chats: [], users: [] }))
  expect(await f.chat.fetchHistory({ topicId: 1 }, null)).toStrictEqual({
    items: [],
    nextBefore: undefined,
    serverCount: 0,
    countExact: true,
  })
  expect(f.calls[0]._).toBe('messages.getReplies')
  expect(f.calls[0]).toMatchObject({ msgId: 1 })
  await f.chat.dispose()
})
test('healthy summary accepts absent optional left flags and preserves exact unread counters', async () => {
  const f = fixture(basic, async () => ({
    dialogs: [
      {
        _: 'dialog',
        peer: { _: 'peerChat', chatId: 123 },
        topMessage: 99,
        readInboxMaxId: 40,
        readOutboxMaxId: 9,
        unreadCount: 12,
        unreadMentionsCount: 2,
      },
    ],
    chats: [chatRaw],
  }))
  const result = await f.chat.fetchSummary()
  expect(result.unreadCount).toBe(12)
  expect(result.readInboxMaxId).toBe(40)
  expect(result.canSendText).toBe(true)
  await f.chat.dispose()
})
test('short topic counters are replaced with targeted full metadata', async () => {
  const full = {
    _: 'forumTopic',
    id: 8,
    title: 'Full',
    topMessage: 17,
    date: 3,
    readInboxMaxId: 6,
    readOutboxMaxId: 4,
    unreadCount: 9,
    unreadMentionsCount: 1,
  }
  const f = fixture(forum, async request =>
    request._ === 'messages.getForumTopics'
      ? { count: 1, topics: [{ ...full, short: true, unreadCount: 0 }], messages: [message(17)], users: [], chats: [] }
      : { topics: [full], messages: [message(17)], users: [], chats: [] },
  )
  const result = await f.chat.fetchTopics(null)
  expect(result.items[0].unreadCount).toBe(9)
  expect(f.calls[1]._).toBe('messages.getForumTopicsByID')
  await f.chat.dispose()
})
test('remembered topic lookup is scoped and confirms deleted IDs without scanning pages', async () => {
  const f = fixture(forum, async () => ({
    topics: [{ _: 'forumTopicDeleted', id: 72 }],
    messages: [],
    users: [],
    chats: [],
  }))
  expect(await f.chat.fetchTopic(72)).toBeNull()
  expect(f.calls[0]).toMatchObject({
    _: 'messages.getForumTopicsByID',
    topics: [72],
    peer: { _: 'inputPeerChannel', channelId: 123 },
  })
})
test('reply lookup requires a known in-group reference and rejects unrelated returned peers', async () => {
  const f = fixture(basic, async () => ({
    _: 'messages.messages',
    messages: [message(4, { peerId: { _: 'peerChat', chatId: 999 } })],
    users: [user],
    chats: [chatRaw],
  }))
  const source = record(9, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 4 } })
  const outside = record(10, {
    replyTo: { _: 'messageReplyHeader', replyToMsgId: 4, replyToPeerId: { _: 'peerChat', chatId: 999 } },
  })
  f.query.setQueryData(f.chat.cache.keys.history(null), { pages: [{ items: [source, outside] }], pageParams: [null] })
  expect(await f.chat.fetchReply(999)).toBeNull()
  expect(await f.chat.fetchReply(10)).toBeNull()
  expect(f.calls).toHaveLength(0)
  expect(await f.chat.fetchReply(9)).toBeNull()
  expect(f.calls).toHaveLength(1)
})
test('an in-flight unloaded reply cannot restore a deleted message', async () => {
  const wait = deferred<unknown>()
  const f = fixture(basic, () => wait.promise)
  f.query.setQueryData(f.chat.cache.keys.history(null), {
    pages: [{ items: [record(9, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 4 } })] }],
    pageParams: [null],
  })
  const reply = f.chat.fetchReply(9)
  await tick()
  await f.chat.cache.remove([4])
  wait.resolve({ _: 'messages.messages', messages: [message(4)], users: [user], chats: [chatRaw] })
  expect(await reply).toBeNull()
})
test('edited quoted messages refresh excerpts after history reconciliation', async () => {
  const f = fixture()
  f.query.setQueryData(f.chat.cache.keys.history(null), {
    pages: [{ items: [record(9, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 4 } }), record(4)] }],
    pageParams: [null],
  })
  const observer = new QueryObserver(f.query, {
    queryKey: queryKeys.telegram.reply({ params: { messageId: 9 }, other: [f.chat.scope] }),
    queryFn: () => f.chat.fetchReply(9),
  })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  await observer.refetch()
  expect(observer.getCurrentResult().data?.text).toBe('m4')
  await f.chat.cache.upsert(record(4, { message: 'changed', editDate: 200 }))
  await tick()
  expect(observer.getCurrentResult().data?.text).toBe('changed')
})
test('routine metadata refresh retains visible topic pages until all fresh pages are ready', async () => {
  const f = fixture(forum)
  const wait = deferred<TopicPage>()
  const key = f.chat.cache.keys.topics()
  const cursor = { id: 7, date: 10, topic: 5 }
  const head: TopicPage = { items: [], serverCount: 60, nextOffset: cursor }
  const tail: TopicPage = { items: [], serverCount: 60 }
  f.query.setQueryData(key, { pages: [head, tail], pageParams: [null, cursor] })
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    staleTime: Infinity,
    initialPageParam: null as TopicCursor | null,
    queryFn: ({ pageParam }) => (pageParam ? Promise.resolve(tail) : wait.promise),
    getNextPageParam: page => page.nextOffset,
  })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  f.chat.cache.refreshMetadata()
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(f.query.getQueryData<InfiniteData<TopicPage>>(key)?.pages).toHaveLength(2)
  wait.resolve(head)
  await tick()
  expect(f.query.getQueryData<InfiniteData<TopicPage>>(key)?.pageParams).toEqual([null, cursor])
})
test('cancelled transport result and disposed scope cannot return history or revive queries', async () => {
  const wait = deferred<tl.messages.TypeMessages>()
  const f = fixture(basic, () => wait.promise)
  const pending = f.chat.fetchHistory({ topicId: null }, null)
  const disposal = f.chat.dispose()
  wait.resolve({ _: 'messages.messages', topics: [], messages: [message(3)], users: [user], chats: [chatRaw] })
  await expect(pending).rejects.toMatchObject({ category: 'unavailable' })
  await disposal
  expect(f.query.getQueryCache().getAll().length).toBe(0)
})
test('upsert keeps pages/cursors, deduplicates echoes and preserves newer edits', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9, 8), page(7, 6)], pageParams: [null, { id: 8, date: 100 }] })
  await f.chat.cache.upsert(record(10))
  await f.chat.cache.upsert(record(10))
  await f.chat.cache.upsert(record(8, { message: 'edited', editDate: 200 }))
  await f.chat.cache.upsert(record(8))
  const data = f.query.getQueryData<InfiniteData<HistoryPage>>(key)!
  expect(data.pages.map(page => page.items.map(item => item.view.id))).toStrictEqual([
    [10, 9, 8],
    [7, 6],
  ])
  expect(data.pages[0].items[2].view.text).toBe('edited')
  expect(data.pageParams).toStrictEqual([null, { id: 8, date: 100 }])
  await f.chat.dispose()
})
test('deletion tombstone prevents delayed send result resurrection', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9, 8)], pageParams: [null] })
  await f.chat.cache.remove([9])
  await f.chat.cache.upsert(record(9))
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.map(item => item.view.id)).toStrictEqual([
    8,
  ])
  await f.chat.dispose()
})
test('upsert awaits cancellation reversion during next-page fetch and keeps cursor alignment', async () => {
  const f = fixture()
  const wait = deferred<HistoryPage>()
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ pageParam, signal }) => {
      void signal
      return pageParam ? wait.promise : Promise.resolve(page(9, 8))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  await observer.refetch()
  const pending = observer.fetchNextPage()
  await tick()
  await f.chat.cache.upsert(record(10))
  wait.resolve(page(7, 6))
  await pending
  const data = f.query.getQueryData<InfiniteData<HistoryPage>>(key)!
  expect(data.pages[0].items.map(item => item.view.id)).toStrictEqual([10, 9, 8])
  expect(data.pages.length).toBe(data.pageParams.length)
  expect(data.pages.length).toBe(1)
  unsubscribe()
  await f.chat.dispose()
})
test('updates refresh observed summary without any history cache', async () => {
  const f = fixture()
  let fetches = 0
  const observer = new QueryObserver(f.query, { queryKey: f.chat.cache.keys.summary(), queryFn: async () => ++fetches })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  await observer.refetch()
  await f.chat.cache.upsert(record(9))
  await tick()
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(fetches >= 2).toBeTruthy()
  expect(f.query.getQueryData(f.chat.cache.keys.history(null))).toBe(undefined)
  unsubscribe()
  await f.chat.dispose()
})
test('peerless delete never touches channel with equal message IDs; unrelated events are ignored', async () => {
  const f = fixture(forum)
  const key = f.chat.cache.keys.history(1)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const remove = subscribeChatUpdates(
    f.sdk,
    forum,
    f.chat.cache,
    () => true,
    async () => {},
  )
  f.client.onRawUpdate.emit({
    update: { _: 'updateDeleteMessages', messages: [9], pts: 1, ptsCount: 1 },
    peers: peers(),
  })
  f.client.onRawUpdate.emit({
    update: {
      _: 'updateNewChannelMessage',
      pts: 1,
      ptsCount: 1,
      message: message(10, { peerId: { _: 'peerChannel', channelId: 999 } }),
    },
    peers: peers(),
  })
  await tick()
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.length).toBe(1)
  remove()
  await f.chat.dispose()
})
test('unknown peerless delete cancels initial basic history and restarts newest', async () => {
  const f = fixture()
  const first = deferred<HistoryPage>()
  let calls = 0
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ signal }) => {
      void signal
      return ++calls === 1 ? first.promise : Promise.resolve(page(8))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  const remove = subscribeChatUpdates(
    f.sdk,
    basic,
    f.chat.cache,
    () => true,
    async () => {},
  )
  await tick()
  f.client.onRawUpdate.emit({
    update: { _: 'updateDeleteMessages', messages: [9], pts: 1, ptsCount: 1 },
    peers: peers(),
  })
  await tick()
  first.resolve(page(9, 8))
  await tick()
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.map(item => item.view.id)).toStrictEqual([
    8,
  ])
  remove()
  unsubscribe()
  await f.chat.dispose()
})
test('recovery discards stale tail and all old pageParams, including inactive history', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9), page(7)], pageParams: [null, { id: 9, date: 100 }] })
  await f.chat.cache.recover()
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!).toBe(undefined)
  await f.chat.dispose()
})
test('read acknowledgement is explicit, scoped, and coalesces increasing General maxima', async () => {
  const first = deferred<boolean>()
  const f = fixture(forum, _request => (f.calls.length === 1 ? first.promise : Promise.resolve(true)))
  const key = f.chat.cache.keys.history(1)
  f.query.setQueryData(key, {
    pages: [{ items: [record(9), record(8)].map(item => ({ ...item, view: { ...item.view, topicId: 1 } })) }],
    pageParams: [null],
  })
  const a = f.chat.acknowledgeRead({ topicId: 1 }, 8)
  const b = f.chat.acknowledgeRead({ topicId: 1 }, 9)
  first.resolve(true)
  await Promise.all([a, b])
  expect(
    f.calls.map(call => {
      if (call._ !== 'messages.readDiscussion') expect.fail('Unexpected read RPC')
      return [call._, call.msgId, call.readMaxId]
    }),
  ).toStrictEqual([
    ['messages.readDiscussion', 1, 8],
    ['messages.readDiscussion', 1, 9],
  ])
  expect(() => f.chat.acknowledgeRead({ topicId: 1 }, 999)).toThrow()
  await f.chat.dispose()
})
test('send retry keeps random ID and replaces the local message with the canonical short response', async () => {
  const f = fixture(basic, async () => ({
    _: 'updateShortSentMessage',
    id: 10,
    date: 100,
    out: true,
    pts: 1,
    ptsCount: 1,
  }))
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  const options = telegramSendOptions(f.chat)
  const result = await f.query.getMutationCache().build(f.query, options).execute({ operation })
  await f.query.getMutationCache().build(f.query, options).execute({ operation })
  expect(result.view.id).toBe(10)
  const first = f.calls[0]
  if (first._ !== 'messages.sendMessage') expect.fail('Unexpected send RPC')
  expect(f.calls[1]).toMatchObject({ randomId: first.randomId })
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.map(item => item.view.id)).toStrictEqual([
    10, 9,
  ])
  expect(Object.isFrozen(operation)).toBe(true)
  expect(f.chat.cache.outgoing()).toEqual([])
  await f.chat.dispose()
})
test('multiple sends appear before confirmation and identical text keeps separate message identities', async () => {
  const waits = [deferred<tl.TypeUpdates>(), deferred<tl.TypeUpdates>()]
  const started: string[] = []
  let request = 0
  const f = fixture(basic, method => {
    if (method._ !== 'messages.sendMessage') expect.fail('Unexpected send RPC')
    expect(started).toContain(method.randomId.toString())
    return waits[request++].promise
  })
  await f.chat.start()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const operations = [0, 1].map(() => f.chat.createSend({ topicId: null, text: 'same text' }))
  const options = telegramSendOptions(f.chat, operation => {
    expect(f.chat.cache.findMessage(operation.localId)?.view.text).toBe('same text')
    started.push(operation.id)
  })
  const results = operations.map(operation => f.query.getMutationCache().build(f.query, options).execute({ operation }))
  await tick()
  expect(f.calls).toHaveLength(2)
  expect(started).toEqual(operations.map(operation => operation.id))
  expect(f.chat.cache.outgoing().map(item => item.record.view)).toMatchObject([
    { text: 'same text', outgoing: true, sender: { name: 'One' } },
    { text: 'same text', outgoing: true, sender: { name: 'One' } },
  ])
  expect(new Set(f.chat.cache.outgoing().map(item => item.record.view.id)).size).toBe(2)
  expect(() => f.chat.acknowledgeRead({ topicId: null }, operations[0].localId)).toThrow()
  expect(f.chat.cache.findMessage(operations[0].localId)?.view.text).toBe('same text')
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)?.pages[0].items).toHaveLength(1)
  // Confirm out of order, with another incoming message already at the head.
  await f.chat.cache.upsert(record(12))
  for (const index of [1, 0]) {
    waits[index].resolve({ _: 'updateShortSentMessage', id: 10 + index, date: 100, out: true, pts: 1, ptsCount: 1 })
    await results[index]
  }
  await f.chat.cache.upsert(record(10, { message: 'same text', out: true }))
  expect(f.chat.cache.outgoing()).toEqual([])
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)?.pages[0].items.map(item => item.view.id)).toEqual([
    12, 11, 10, 9,
  ])
})
test('a failed send retains its own retry identity while another send completes', async () => {
  let fail = true
  const f = fixture(basic, async request => {
    if (request._ === 'messages.sendMessage' && request.message === 'first' && fail) throw new Error('transport')
    return { _: 'updateShortSentMessage', id: fail ? 10 : 11, date: 100, out: true, pts: 1, ptsCount: 1 }
  })
  const first = f.chat.createSend({ topicId: null, text: 'first' })
  const second = f.chat.createSend({ topicId: null, text: 'second' })
  const execute = (operation: typeof first) =>
    f.query.getMutationCache().build(f.query, telegramSendOptions(f.chat)).execute({ operation })
  await expect(execute(first)).rejects.toMatchObject({ category: 'unknown-send' })
  await execute(second)
  expect(f.chat.cache.outgoing()).toHaveLength(1)
  expect(f.chat.cache.outgoing()[0]).toMatchObject({ operation: first, error: { category: 'unknown-send' } })
  // Even without an existing history query, confirmation keeps the sent message visible.
  expect(f.chat.cache.findMessage(10)?.view.text).toBe('second')
  fail = false
  await execute(first)
  expect(f.chat.cache.outgoing()).toEqual([])
  const requests = f.calls.filter(request => request._ === 'messages.sendMessage')
  expect(requests[2].randomId).toEqual(requests[0].randomId)
  expect(f.chat.cache.findMessage(11)?.view.text).toBe('first')
})
test.each(['confirmation first', 'message first'] as const)(
  'realtime reconciliation uses the operation ID with %s and ignores a late failure',
  async order => {
    const f = fixture()
    await f.chat.start()
    const key = f.chat.cache.keys.history(null)
    f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
    const operation = f.chat.createSend({ topicId: null, text: 'hello' })
    f.chat.beginSend(operation)
    const confirm = () => {
      f.client.onRawUpdate.emit({
        update: { _: 'updateMessageID', randomId: Long.fromString(operation.id), id: 10 },
        peers: peers(),
      } as RawUpdateInfo)
    }
    if (order === 'confirmation first') confirm()
    f.client.onRawUpdate.emit({
      update: { _: 'updateNewMessage', message: message(10, { message: 'hello', out: true }), pts: 1, ptsCount: 1 },
      peers: peers(),
    } as RawUpdateInfo)
    if (order === 'message first') confirm()
    await tick()
    f.chat.cache.updateSend(operation.id, { error: new Error('late transport failure') })
    await f.chat.cache.upsert(record(10, { message: 'hello', out: true }), operation.id)
    expect(f.chat.cache.outgoing()).toEqual([])
    expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)?.pages[0].items.map(item => item.view.id)).toEqual([
      10, 9,
    ])
  },
)
test('outgoing attachments survive recovery, keep topic and reply identity, and are cleared on disposal', async () => {
  const f = fixture(forum)
  const source = new Blob(['file'], { type: 'text/plain' })
  const operation = f.chat.createSend(
    { topicId: 4, text: 'caption', replyToId: 8 },
    { source, name: 'note.txt', mime: 'text/plain', mode: 'original' },
  )
  f.chat.beginSend(operation)
  f.chat.cache.updateSend(operation.id, { progress: 50 })
  await f.chat.cache.recover()
  expect(f.chat.cache.outgoing()[0]).toMatchObject({
    progress: 50,
    operation: { id: operation.id, attachment: { source } },
    record: { view: { topicId: 4, replyToId: 8, attachment: { name: 'note.txt', downloadable: false } } },
  })
  const ordinary = f.chat.createSend({ topicId: 4, text: 'ordinary message' })
  f.chat.beginSend(ordinary)
  expect(f.chat.cache.findMessage(ordinary.localId)?.view.replyToId).toBeUndefined()
  await f.chat.cache.confirmSend(operation.id, 10)
  await f.chat.cache.remove([10])
  await f.chat.cache.upsert({ ...record(10), view: { ...record(10).view, topicId: 4 } }, operation.id)
  expect(f.chat.cache.findMessage(10)).toBeUndefined()
  expect(f.chat.cache.outgoing().map(item => item.operation.id)).toEqual([ordinary.id])
  await f.chat.dispose()
  f.chat.cache.updateSend(ordinary.id, { progress: 90 })
  expect(f.query.getQueryCache().getAll()).toEqual([])
})
test('a basic-group deletion before the send response cannot restore an acknowledged outgoing message', async () => {
  const f = fixture()
  await f.chat.start()
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  f.chat.beginSend(operation)
  await f.chat.cache.confirmSend(operation.id, 10)
  f.client.onRawUpdate.emit({
    update: { _: 'updateDeleteMessages', messages: [10], pts: 1, ptsCount: 1 },
    peers: peers(),
  } as RawUpdateInfo)
  await tick()
  await f.chat.cache.upsert(record(10), operation.id)
  expect(f.chat.cache.outgoing()).toEqual([])
  expect(f.chat.cache.findMessage(10)).toBeUndefined()
})
test('send transport leaves cache reconciliation to the success callback', async () => {
  const f = fixture(basic, async () => ({
    _: 'updateShortSentMessage',
    id: 10,
    date: 100,
    out: true,
    pts: 1,
    ptsCount: 1,
  }))
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const options = telegramSendOptions(f.chat)
  const variables = { operation: f.chat.createSend({ topicId: null, text: 'hello' }) }
  const context = { client: f.query, meta: undefined, mutationKey: options.mutationKey }
  const result = await options.mutationFn!(variables, context)
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.length).toBe(1)
  await f.chat.dispose()
  await options.onSuccess!(result, variables, undefined, context)
  expect(f.query.getQueryCache().getAll().length).toBe(0)
})
test('read success refreshes unread metadata through the mutation callback', async () => {
  const f = fixture(forum, async () => true)
  f.query.setQueryData(f.chat.cache.keys.history(1), {
    pages: [{ items: [{ ...record(9), view: { ...record(9).view, topicId: 1 } }] }],
    pageParams: [null],
  })
  let fetches = 0
  const observer = new QueryObserver(f.query, { queryKey: f.chat.cache.keys.summary(), queryFn: async () => ++fetches })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  await observer.refetch()
  const before = fetches
  await f.query.getMutationCache().build(f.query, telegramReadOptions(f.chat)).execute({ topicId: 1, maxId: 9 })
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(fetches > before).toBeTruthy()
  unsubscribe()
  await f.chat.dispose()
})
test('cancelled final text RPC reports unknown outcome, and old scope cannot reuse operation', async () => {
  const f = fixture(
    basic,
    (_request, { abortSignal } = {}) =>
      new Promise((_, reject) =>
        abortSignal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      ),
  )
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  const sending = f.chat.send(operation)
  await tick()
  f.chat.cancel(operation.id)
  await expect(sending).rejects.toMatchObject({ category: 'unknown-send' })
  const newer = fixture()
  await expect(newer.chat.send(operation)).rejects.toMatchObject({ category: 'invalid-input' })
  await f.chat.dispose()
  await newer.chat.dispose()
})
test('dispose during startup removes handlers immediately and stops after startup finishes', async () => {
  const wait = deferred()
  const f = fixture()
  let stopped = 0
  f.client.startUpdatesLoop = () => wait.promise
  f.client.stopUpdatesLoop = async () => {
    stopped++
  }
  const started = f.chat.start()
  expect(f.client.onRawUpdate.size).toBe(1)
  const disposed = f.chat.dispose()
  expect(f.client.onRawUpdate.size).toBe(0)
  wait.resolve()
  await Promise.all([started, disposed])
  expect(stopped).toBe(1)
})

test('read acknowledgements never lower an already confirmed marker', async () => {
  const f = fixture(forum, async () => true)
  f.query.setQueryData(f.chat.cache.keys.history(1), {
    pages: [{ items: [record(9), record(8)].map(item => ({ ...item, view: { ...item.view, topicId: 1 } })) }],
    pageParams: [null],
  })
  await f.chat.acknowledgeRead({ topicId: 1 }, 9)
  await f.chat.acknowledgeRead({ topicId: 1 }, 8)
  expect(f.calls.length).toBe(1)
  await f.chat.dispose()
})
test('initial-fetch cancellation restarts rather than fabricating an update-only page', async () => {
  const f = fixture()
  const first = deferred<HistoryPage>()
  let calls = 0
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ signal }) => {
      void signal
      return ++calls === 1 ? first.promise : Promise.resolve(page(10, 9))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  onTestFinished(unsubscribe)
  await tick()
  await f.chat.cache.upsert(record(10))
  first.resolve(page(9))
  await tick()
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.map(item => item.view.id)).toStrictEqual([
    10, 9,
  ])
  unsubscribe()
  await f.chat.dispose()
})
test('safe upload validation categories survive the runtime boundary', async () => {
  const f = fixture()
  const operation = f.chat.createSend(
    { topicId: null, text: '' },
    { source: new Blob([]), name: 'empty', mime: 'application/octet-stream', mode: 'original' },
  )
  await expect(f.chat.send(operation)).rejects.toMatchObject({ category: 'invalid-file' })
  await f.chat.dispose()
})
test('explicit startup revoked rejection invokes lifecycle callback without relying on SDK onError', async () => {
  const f = fixture()
  let revoked = 0
  f.client.startUpdatesLoop = async () => {
    throw new tl.RpcError(401, 'SESSION_REVOKED')
  }
  const chat = new TelegramChat(
    f.sdk,
    basic,
    f.query,
    () => {},
    async () => {
      revoked++
    },
  )
  await chat.start()
  expect(revoked).toBe(1)
  await chat.dispose()
  await f.chat.dispose()
})
