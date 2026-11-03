import type {
  HistoryCursor,
  HistoryPage,
  TelegramMessageEvent,
  TopicCursor,
  TopicPage,
} from '../../../src/services/telegram/chat-data'
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
import { expect, onTestFinished, test, vi } from 'vitest'

import { telegramImageCache } from '../../../src/services/tauri/telegram-image-cache-client'
import { TelegramChat } from '../../../src/services/telegram/chat'
import { projectMessage, topicFor } from '../../../src/services/telegram/chat-data'
import * as chatFiles from '../../../src/services/telegram/chat-files'
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
const avatarRecord = () =>
  projectMessage(
    basic,
    message(7),
    PeersIndex.from({
      users: [{ ...user, photo: { _: 'userProfilePhoto', photoId: Long.fromNumber(9), dcId: 2 } }],
      chats: [chatRaw],
    }),
  )!
const page = (...ids: number[]) => ({
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

test('notification avatars load without mounted history and reuse native cached bytes after restart', async () => {
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  vi.spyOn(telegramImageCache, 'scope').mockResolvedValue('token')
  const read = vi.spyOn(telegramImageCache, 'read').mockResolvedValue(new Uint8Array())
  const write = vi.spyOn(telegramImageCache, 'write').mockResolvedValue()
  const download = vi.spyOn(chatFiles, 'downloadAvatar').mockResolvedValue(blob)
  const row = avatarRecord()
  const { chat } = fixture()
  const fetch = vi.spyOn(chat, 'fetchNotificationMessages').mockResolvedValue([row])
  expect(chat.cache.findMessage(7)).toBeUndefined()
  expect(await chat.avatar(row.view)).toBe(blob)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith('token', 'avatar:user:1:9:small', bytes)

  read.mockResolvedValue(bytes)
  const restarted = fixture().chat
  const fetchAfterRestart = vi.spyOn(restarted, 'fetchNotificationMessages')
  expect(new Uint8Array(await (await restarted.avatar(row.view))!.arrayBuffer())).toEqual(bytes)
  expect(fetchAfterRestart).not.toHaveBeenCalled()
  expect(download).toHaveBeenCalledTimes(1)
})

test.each(['sender', 'photo'] as const)('avatar refresh rejects a different %s identity', async changed => {
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  vi.spyOn(telegramImageCache, 'scope').mockResolvedValue('token')
  vi.spyOn(telegramImageCache, 'read').mockResolvedValue(new Uint8Array())
  const download = vi.spyOn(chatFiles, 'downloadAvatar')
  const row = avatarRecord()
  const fresh = {
    ...row,
    avatar: { ...row.avatar!, ...(changed === 'sender' ? { senderId: 'user:99' } : { photoId: '10' }) },
  }
  const { chat } = fixture()
  vi.spyOn(chat, 'fetchNotificationMessages').mockResolvedValue([fresh])
  expect(await chat.avatar(row.view)).toBeNull()
  expect(download).not.toHaveBeenCalled()
})

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
  expect(result?.preview).toBe(undefined)
  expect(result?.image).toBe(undefined)
})
test('image projection selects a full photo separately from its thumbnail and excludes ephemeral media', () => {
  const media: tl.RawMessageMediaPhoto = {
    _: 'messageMediaPhoto',
    photo: {
      _: 'photo',
      id: Long.ONE,
      accessHash: Long.ONE,
      dcId: 2,
      date: 0,
      fileReference: new Uint8Array([1]),
      sizes: [
        { _: 'photoSize', type: 's', w: 80, h: 80, size: 100 },
        { _: 'photoSizeProgressive', type: 'y', w: 1280, h: 960, sizes: [100, 900_000] },
      ],
    },
  }
  const result = record(7, { media })
  expect(result.preview).toMatchObject({ size: 100, location: { thumbSize: 's' } })
  expect(result.image).toMatchObject({ size: 900_000, location: { thumbSize: 'y' } })
  const ephemeral = record(7, { media: { ...media, ttlSeconds: 30 } })
  expect(ephemeral.preview).toBeUndefined()
  expect(ephemeral.image).toBeUndefined()
})

test('notification image reads refresh an expired reference and reject replaced attachments', async () => {
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  const { chat } = fixture()
  const photo = record(7)
  photo.view.attachment = { kind: 'photo', id: '1', size: 100, mime: 'image/jpeg', downloadable: true, spoiler: false }
  photo.image = {
    mediaId: '1',
    size: 100,
    dcId: 2,
    location: {
      _: 'inputPhotoFileLocation',
      id: Long.ONE,
      accessHash: Long.ONE,
      fileReference: new Uint8Array([1]),
      thumbSize: 'y',
    },
  }
  const read = vi.spyOn(chat, 'fetchNotificationMessages').mockResolvedValue([photo])
  const blob = new Blob(['image'])
  const download = vi
    .spyOn(chatFiles, 'downloadImage')
    .mockRejectedValueOnce(new chatFiles.TelegramFileError('unavailable'))
    .mockResolvedValue(blob)
  expect(await chat.notificationImage(photo.view, true)).toBe(blob)
  expect(read).toHaveBeenCalledTimes(2)
  expect(download).toHaveBeenCalledTimes(2)
  read.mockResolvedValue([{ ...photo, view: { ...photo.view, attachment: { ...photo.view.attachment, id: '2' } } }])
  expect(await chat.notificationImage(photo.view, true)).toBeNull()
  expect(download).toHaveBeenCalledTimes(2)
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
test('targeted topic lookup is scoped and confirms deleted IDs without scanning pages', async () => {
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
    new Map(),
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
    new Map(),
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
test('send uses a stable random ID and reconciles the canonical response into loaded history', async () => {
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
  const result = await f.chat.send(operation)
  expect(result.view).toMatchObject({ id: 10, text: 'hello' })
  expect(f.calls[0]).toMatchObject({ _: 'messages.sendMessage', randomId: Long.fromString(operation.id) })
  expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)!.pages[0].items.map(item => item.view.id)).toEqual([
    10, 9,
  ])
  expect(Object.isFrozen(operation)).toBe(true)
  expect(f.query.getMutationCache().getAll()).toEqual([])
})
test.each([false, true])('simultaneous sends reconcile out of order with loaded history: %s', async loaded => {
  const waits = [deferred<tl.TypeUpdates>(), deferred<tl.TypeUpdates>()]
  let request = 0
  const f = fixture(basic, () => waits[request++].promise)
  const key = f.chat.cache.keys.history(null)
  const pages = [page(9), page(7, 6)]
  const pageParams = [null, { id: 9, date: 100 }]
  if (loaded) f.query.setQueryData(key, { pages, pageParams })
  const operations = [0, 1].map(() => f.chat.createSend({ topicId: null, text: 'same text' }))
  const results = operations.map(operation => f.chat.send(operation))
  await tick()
  await expect(f.chat.send(operations[0])).rejects.toMatchObject({ category: 'invalid-input' })
  expect(f.calls).toHaveLength(2)
  expect(new Set(operations.map(operation => operation.id)).size).toBe(2)
  for (const index of [1, 0]) {
    waits[index].resolve({ _: 'updateShortSentMessage', id: 10 + index, date: 100, out: true, pts: 1, ptsCount: 1 })
    expect((await results[index]).view.id).toBe(10 + index)
  }
  if (loaded) {
    const history = f.query.getQueryData<InfiniteData<HistoryPage>>(key)!
    expect(history.pages.map(page => page.items.map(item => item.view.id))).toEqual([
      [11, 10, 9],
      [7, 6],
    ])
    expect(history.pages.map(page => page.nextBefore)).toEqual(pages.map(page => page.nextBefore))
    expect(history.pageParams).toEqual(pageParams)
  } else {
    expect(f.query.getQueryCache().getAll()).toEqual([])
  }
})
test.each([1, 4])('forum sends route to destination %s without composing a user reply', async topicId => {
  const f = fixture(forum, async () => ({
    _: 'updateShortSentMessage',
    id: 10,
    date: 100,
    out: true,
    pts: 1,
    ptsCount: 1,
  }))
  const result = await f.chat.send(f.chat.createSend({ topicId, text: 'hello' }))
  expect(result.view.topicId).toBe(topicId)
  const request = f.calls.find(request => request._ === 'messages.sendMessage')!
  expect(request.peer).toMatchObject({ _: 'inputPeerChannel', channelId: 123 })
  if (topicId === 1) expect(request.replyTo).toBeUndefined()
  else expect(request.replyTo).toMatchObject({ replyToMsgId: topicId })
})
test.each(['confirmation first', 'message first'] as const)(
  'realtime echo and send response preserve newer edits with %s',
  async order => {
    const wait = deferred<tl.TypeUpdates>()
    const f = fixture(basic, () => wait.promise)
    await f.chat.start()
    const key = f.chat.cache.keys.history(null)
    f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
    const operation = f.chat.createSend({ topicId: null, text: 'hello' })
    const sending = f.chat.send(operation)
    await tick()
    const confirm = () =>
      f.client.onRawUpdate.emit({
        update: { _: 'updateMessageID', randomId: Long.fromString(operation.id), id: 10 },
        peers: peers(),
      } as RawUpdateInfo)
    if (order === 'confirmation first') confirm()
    f.client.onRawUpdate.emit({
      update: {
        _: 'updateNewMessage',
        message: message(10, { message: 'edited', editDate: 200, out: true }),
        pts: 1,
        ptsCount: 1,
      },
      peers: peers(),
    } as RawUpdateInfo)
    if (order === 'message first') confirm()
    wait.resolve({ _: 'updateShortSentMessage', id: 10, date: 100, out: true, pts: 1, ptsCount: 1 })
    await sending
    expect(f.chat.cache.findMessage(10)?.view.text).toBe('edited')
    expect(f.query.getQueryData<InfiniteData<HistoryPage>>(key)?.pages[0].items.map(item => item.view.id)).toEqual([
      10, 9,
    ])
  },
)
test('basic-group deletion between acknowledgement and send response cannot resurrect the message', async () => {
  const wait = deferred<tl.TypeUpdates>()
  const f = fixture(basic, () => wait.promise)
  await f.chat.start()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  const sending = f.chat.send(operation)
  await tick()
  // Deliberately no await between acknowledgement and deletion: the body is still absent.
  f.client.onRawUpdate.emit({
    update: { _: 'updateMessageID', randomId: Long.fromString(operation.id), id: 10 },
    peers: peers(),
  } as RawUpdateInfo)
  f.client.onRawUpdate.emit({
    update: { _: 'updateDeleteMessages', messages: [10], pts: 1, ptsCount: 1 },
    peers: peers(),
  } as RawUpdateInfo)
  wait.resolve({ _: 'updateShortSentMessage', id: 10, date: 100, out: true, pts: 1, ptsCount: 1 })
  expect((await sending).view.id).toBe(10)
  expect(f.chat.cache.isDeleted(10)).toBe(true)
  expect(f.chat.cache.findMessage(10)).toBeUndefined()
  expect(f.chat.cache.findMessage(9)).toBeDefined()
})
test('failed send correlation is released and late acknowledgements cannot claim unrelated deletions', async () => {
  const f = fixture(basic, async () => {
    throw new Error('transport')
  })
  await f.chat.start()
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  await expect(f.chat.send(operation)).rejects.toMatchObject({ category: 'unknown-send' })
  f.client.onRawUpdate.emit({
    update: { _: 'updateMessageID', randomId: Long.fromString(operation.id), id: 10 },
    peers: peers(),
  } as RawUpdateInfo)
  f.client.onRawUpdate.emit({
    update: { _: 'updateDeleteMessages', messages: [10], pts: 1, ptsCount: 1 },
    peers: peers(),
  } as RawUpdateInfo)
  await tick()
  expect(f.chat.cache.isDeleted(10)).toBe(false)
  expect(f.query.getQueryCache().getAll()).toEqual([])
  expect(f.calls).toHaveLength(1)
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
  const controller = new AbortController()
  const sending = f.chat.send(operation, { signal: controller.signal })
  await tick()
  controller.abort()
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

test('notification history reads the whole selected forum and retains topic identities', async () => {
  const { chat, calls } = fixture(forum, async request => {
    if (request._ === 'messages.getHistory')
      return {
        _: 'messages.messages',
        chats: [
          {
            _: 'channel',
            id: 123,
            title: 'Group',
            forum: true,
            megagroup: true,
            photo: { _: 'chatPhotoEmpty' },
            date: 1,
          },
        ],
        users: [user],
        messages: [
          message(20, { peerId: { _: 'peerChannel', channelId: 123 }, out: true }),
          message(19, {
            peerId: { _: 'peerChannel', channelId: 123 },
            replyTo: { _: 'messageReplyHeader', forumTopic: true, replyToTopId: 8, replyToMsgId: 8 },
          }),
          message(18, { peerId: { _: 'peerChannel', channelId: 123 } }),
          message(17, { peerId: { _: 'peerChannel', channelId: 999 } }),
        ],
      }
    throw new Error(`Unexpected ${request._}`)
  })
  const result = await chat.fetchNotificationHistory(null)
  expect(result.items.map(row => [row.view.id, row.view.topicId])).toEqual([
    [20, 1],
    [19, 8],
    [18, 1],
  ])
  expect(result.newestId).toBe(20)
  expect(result.nextBefore).toEqual({ id: 17, date: 100 })
  expect(calls[0]).toMatchObject({ _: 'messages.getHistory', peer: { _: 'inputPeerChannel', channelId: 123 } })
})

test('notification events receive selected-group messages without any history query mounted', async () => {
  const { chat, client } = fixture()
  const events: TelegramMessageEvent[] = []
  const stop = chat.subscribeMessages(event => events.push(event))
  await chat.start()
  client.onRawUpdate.emit({
    update: { _: 'updateNewMessage', message: message(7), pts: 1, ptsCount: 1 },
    peers: peers(),
  })
  client.onRawUpdate.emit({
    update: { _: 'updateEditMessage', message: message(7, { editDate: 500 }), pts: 2, ptsCount: 1 },
    peers: peers(),
  })
  client.onRawUpdate.emit({
    update: {
      _: 'updateNewMessage',
      message: message(8, { peerId: { _: 'peerChat', chatId: 999 } }),
      pts: 3,
      ptsCount: 1,
    },
    peers: peers(),
  })
  client.onRawUpdate.emit({ update: { _: 'updateDeleteMessages', messages: [7], pts: 4, ptsCount: 1 }, peers: peers() })
  expect(events).toMatchObject([
    { type: 'message', edited: false, record: { view: { id: 7 } } },
    { type: 'message', edited: true },
    { type: 'deleted', ids: [7] },
  ])
  stop()
})
