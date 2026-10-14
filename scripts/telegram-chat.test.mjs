import { Long, PeersIndex, tl } from '@mtcute/web'
import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TelegramChat } from '../src/services/telegram/chat.ts'
import { projectMessage, topicFor } from '../src/services/telegram/chat-data.ts'
import { telegramReadOptions, telegramSendOptions } from '../src/services/telegram/chat-queries.ts'
import { subscribeChatUpdates } from '../src/services/telegram/chat-updates.ts'

const basic = { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Group' }
const forum = { ...basic, kind: 'supergroup', accessHash: '9', forum: true }
const chatRaw = { _: 'chat', id: 123, title: 'Group' }
const user = { _: 'user', id: 1, firstName: 'One', accessHash: Long.ONE }
const message = (id, extra = {}) => ({
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
    chats: [chatRaw, { _: 'chat', id: 999, title: 'UNRELATED' }],
  })
const record = (id, extra = {}) => projectMessage(basic, message(id, extra), peers())
const page = (...ids) => ({ items: ids.map(id => record(id)), nextBefore: { id: ids[ids.length - 1], date: 100 } })
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function emitter() {
  const handlers = new Set()
  return {
    add: fn => handlers.add(fn),
    remove: fn => handlers.delete(fn),
    emit: value => {
      for (const fn of handlers) fn(value)
    },
    get size() {
      return handlers.size
    },
  }
}
function fixture(
  group = basic,
  call = async request => {
    throw new Error(`Unexpected ${request._}`)
  },
) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const calls = []
  const client = {
    call: async (request, options) => {
      calls.push(request)
      return call(request, options)
    },
    onRawUpdate: emitter(),
    onConnectionState: emitter(),
    startUpdatesLoop: async () => {},
    stopUpdatesLoop: async () => {},
    timers: { cancel: async () => {} },
    storage: {
      self: { getCached: () => ({ userId: 1 }) },
      peers: {
        getCompleteById: async id =>
          id === 1
            ? user
            : group.kind === 'basic'
              ? chatRaw
              : { _: 'channel', id: 123, title: 'Group', forum: group.forum, accessHash: Long.ONE },
      },
    },
    handleClientUpdate() {},
  }
  return { query, client, calls, chat: new TelegramChat(client, group, query) }
}

test('projection rejects another peer and retains no SDK peers or unrelated entries', () => {
  const projected = record(3)
  assert.equal(projected.view.sender.name, 'One')
  assert.equal(JSON.stringify(projected).includes('UNRELATED'), false)
  assert.equal(projectMessage(basic, message(3, { peerId: { _: 'peerChannel', channelId: 123 } }), peers()), null)
  assert.equal('raw' in projected, false)
})
test('forum routing distinguishes General ordinary replies, explicit topics, and creation', () => {
  assert.equal(topicFor(forum, message(8, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 7 } })), 1)
  assert.equal(
    topicFor(
      forum,
      message(8, { replyTo: { _: 'messageReplyHeader', replyToMsgId: 7, forumTopic: true, replyToTopId: 4 } }),
    ),
    4,
  )
  assert.equal(topicFor(forum, { ...message(8), _: 'messageService', action: { _: 'messageActionTopicCreate' } }), 8)
})
test('group-level protection prevents attachment and thumbnail downloads', () => {
  const media = {
    _: 'messageMediaPhoto',
    photo: {
      _: 'photo',
      id: Long.ONE,
      accessHash: Long.ONE,
      dcId: 1,
      fileReference: new Uint8Array(),
      sizes: [{ _: 'photoSize', type: 's', w: 10, h: 10, size: 100 }],
    },
  }
  const protectedPeers = PeersIndex.from({ users: [user], chats: [{ ...chatRaw, noforwards: true }] })
  const result = projectMessage(basic, message(4, { media }), protectedPeers)
  assert.equal(result.view.protected, true)
  assert.equal(result.view.attachment.downloadable, false)
  assert.equal(result.file, undefined)
  assert.equal(result.preview, undefined)
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
  assert.equal(f.calls[0].offsetId, 100)
  assert.deepEqual(result.nextBefore, { id: 37, date: 100 })
  assert.equal(result.countExact, false)
  assert.equal(f.calls.length, 1)
  await f.chat.dispose()
})
test('General uses getReplies, including empty-page termination', async () => {
  const f = fixture(forum, async () => ({ _: 'messages.messages', messages: [], chats: [], users: [] }))
  assert.deepEqual(await f.chat.fetchHistory({ topicId: 1 }, null), {
    items: [],
    nextBefore: undefined,
    serverCount: 0,
    countExact: true,
  })
  assert.equal(f.calls[0]._, 'messages.getReplies')
  assert.equal(f.calls[0].msgId, 1)
  f.client.notifyChannelClosed = async () => {}
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
  assert.equal(result.unreadCount, 12)
  assert.equal(result.readInboxMaxId, 40)
  assert.equal(result.canSendText, true)
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
  assert.equal(result.items[0].unreadCount, 9)
  assert.equal(f.calls[1]._, 'messages.getForumTopicsByID')
  f.client.notifyChannelClosed = async () => {}
  await f.chat.dispose()
})
test('cancelled transport result and disposed scope cannot return history or revive queries', async () => {
  const wait = deferred()
  const f = fixture(basic, () => wait.promise)
  const pending = f.chat.fetchHistory({ topicId: null }, null)
  const disposal = f.chat.dispose()
  wait.resolve({ _: 'messages.messages', messages: [message(3)], users: [user], chats: [chatRaw] })
  await assert.rejects(pending, error => error.category === 'unavailable')
  await disposal
  assert.equal(f.query.getQueryCache().getAll().length, 0)
})
test('upsert keeps pages/cursors, deduplicates echoes and preserves newer edits', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9, 8), page(7, 6)], pageParams: [null, { id: 8, date: 100 }] })
  await f.chat.cache.upsert(record(10))
  await f.chat.cache.upsert(record(10))
  await f.chat.cache.upsert(record(8, { message: 'edited', editDate: 200 }))
  await f.chat.cache.upsert(record(8))
  const data = f.query.getQueryData(key)
  assert.deepEqual(
    data.pages.map(page => page.items.map(item => item.view.id)),
    [
      [10, 9, 8],
      [7, 6],
    ],
  )
  assert.equal(data.pages[0].items[2].view.text, 'edited')
  assert.deepEqual(data.pageParams, [null, { id: 8, date: 100 }])
  await f.chat.dispose()
})
test('deletion tombstone prevents delayed send result resurrection', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9, 8)], pageParams: [null] })
  await f.chat.cache.remove([9])
  await f.chat.cache.upsert(record(9))
  assert.deepEqual(
    f.query.getQueryData(key).pages[0].items.map(item => item.view.id),
    [8],
  )
  await f.chat.dispose()
})
test('upsert awaits cancellation reversion during next-page fetch and keeps cursor alignment', async () => {
  const f = fixture()
  const wait = deferred()
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => {
      void signal
      return pageParam ? wait.promise : Promise.resolve(page(9, 8))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  await observer.refetch()
  const pending = observer.fetchNextPage()
  await tick()
  await f.chat.cache.upsert(record(10))
  wait.resolve(page(7, 6))
  await pending
  const data = f.query.getQueryData(key)
  assert.deepEqual(
    data.pages[0].items.map(item => item.view.id),
    [10, 9, 8],
  )
  assert.equal(data.pages.length, data.pageParams.length)
  assert.equal(data.pages.length, 1)
  unsubscribe()
  await f.chat.dispose()
})
test('updates refresh observed summary without any history cache', async () => {
  const f = fixture()
  let fetches = 0
  const observer = new QueryObserver(f.query, { queryKey: f.chat.cache.keys.summary(), queryFn: async () => ++fetches })
  const unsubscribe = observer.subscribe(() => {})
  await observer.refetch()
  await f.chat.cache.upsert(record(9))
  await tick()
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(fetches >= 2)
  assert.equal(f.query.getQueryData(f.chat.cache.keys.history(null)), undefined)
  unsubscribe()
  await f.chat.dispose()
})
test('peerless delete never touches channel with equal message IDs; unrelated events are ignored', async () => {
  const f = fixture(forum)
  const key = f.chat.cache.keys.history(1)
  f.query.setQueryData(key, { pages: [page(9)], pageParams: [null] })
  const remove = subscribeChatUpdates(
    f.client,
    forum,
    f.chat.cache,
    () => true,
    async () => {},
  )
  f.client.onRawUpdate.emit({ update: { _: 'updateDeleteMessages', messages: [9] }, peers: peers() })
  f.client.onRawUpdate.emit({
    update: { _: 'updateNewChannelMessage', message: message(10, { peerId: { _: 'peerChannel', channelId: 999 } }) },
    peers: peers(),
  })
  await tick()
  assert.equal(f.query.getQueryData(key).pages[0].items.length, 1)
  remove()
  f.client.notifyChannelClosed = async () => {}
  await f.chat.dispose()
})
test('unknown peerless delete cancels initial basic history and restarts newest', async () => {
  const f = fixture()
  const first = deferred()
  let calls = 0
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ signal }) => {
      void signal
      return ++calls === 1 ? first.promise : Promise.resolve(page(8))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  const remove = subscribeChatUpdates(
    f.client,
    basic,
    f.chat.cache,
    () => true,
    async () => {},
  )
  await tick()
  f.client.onRawUpdate.emit({ update: { _: 'updateDeleteMessages', messages: [9] }, peers: peers() })
  await tick()
  first.resolve(page(9, 8))
  await tick()
  assert.deepEqual(
    f.query.getQueryData(key).pages[0].items.map(item => item.view.id),
    [8],
  )
  remove()
  unsubscribe()
  await f.chat.dispose()
})
test('recovery discards stale tail and all old pageParams, including inactive history', async () => {
  const f = fixture()
  const key = f.chat.cache.keys.history(null)
  f.query.setQueryData(key, { pages: [page(9), page(7)], pageParams: [null, { id: 9, date: 100 }] })
  await f.chat.cache.recover()
  assert.equal(f.query.getQueryData(key), undefined)
  await f.chat.dispose()
})
test('read acknowledgement is explicit, scoped, and coalesces increasing General maxima', async () => {
  const first = deferred()
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
  assert.deepEqual(
    f.calls.map(call => [call._, call.msgId, call.readMaxId]),
    [
      ['messages.readDiscussion', 1, 8],
      ['messages.readDiscussion', 1, 9],
    ],
  )
  assert.throws(() => f.chat.acknowledgeRead({ topicId: 1 }, 999))
  f.client.notifyChannelClosed = async () => {}
  await f.chat.dispose()
})
test('send retry keeps random ID and reconciles canonical short response without local echo', async () => {
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
  assert.equal(result.view.id, 10)
  assert.equal(f.calls[0].randomId.toString(), f.calls[1].randomId.toString())
  assert.deepEqual(
    f.query.getQueryData(key).pages[0].items.map(item => item.view.id),
    [10, 9],
  )
  assert.equal(Object.isFrozen(operation), true)
  await f.chat.dispose()
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
  const result = await options.mutationFn({ operation: f.chat.createSend({ topicId: null, text: 'hello' }) })
  assert.equal(f.query.getQueryData(key).pages[0].items.length, 1)
  await f.chat.dispose()
  await options.onSuccess(result)
  assert.equal(f.query.getQueryCache().getAll().length, 0)
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
  await observer.refetch()
  const before = fetches
  await f.query.getMutationCache().build(f.query, telegramReadOptions(f.chat)).execute({ topicId: 1, maxId: 9 })
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(fetches > before)
  unsubscribe()
  f.client.notifyChannelClosed = async () => {}
  await f.chat.dispose()
})
test('cancelled final text RPC reports unknown outcome, and old scope cannot reuse operation', async () => {
  const f = fixture(
    basic,
    (_request, { abortSignal }) =>
      new Promise((_, reject) =>
        abortSignal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      ),
  )
  const operation = f.chat.createSend({ topicId: null, text: 'hello' })
  const sending = f.chat.send(operation)
  await tick()
  f.chat.cancel(operation.id)
  await assert.rejects(sending, error => error.category === 'unknown-send')
  const newer = fixture()
  await assert.rejects(newer.chat.send(operation), error => error.category === 'invalid-input')
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
  assert.equal(f.client.onRawUpdate.size, 1)
  const disposed = f.chat.dispose()
  assert.equal(f.client.onRawUpdate.size, 0)
  wait.resolve()
  await Promise.all([started, disposed])
  assert.equal(stopped, 1)
})

test('read acknowledgements never lower an already confirmed marker', async () => {
  const f = fixture(forum, async () => true)
  f.query.setQueryData(f.chat.cache.keys.history(1), {
    pages: [{ items: [record(9), record(8)].map(item => ({ ...item, view: { ...item.view, topicId: 1 } })) }],
    pageParams: [null],
  })
  await f.chat.acknowledgeRead({ topicId: 1 }, 9)
  await f.chat.acknowledgeRead({ topicId: 1 }, 8)
  assert.equal(f.calls.length, 1)
  f.client.notifyChannelClosed = async () => {}
  await f.chat.dispose()
})
test('initial-fetch cancellation restarts rather than fabricating an update-only page', async () => {
  const f = fixture()
  const first = deferred()
  let calls = 0
  const key = f.chat.cache.keys.history(null)
  const observer = new InfiniteQueryObserver(f.query, {
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ signal }) => {
      void signal
      return ++calls === 1 ? first.promise : Promise.resolve(page(10, 9))
    },
    getNextPageParam: page => page.nextBefore,
  })
  const unsubscribe = observer.subscribe(() => {})
  await tick()
  await f.chat.cache.upsert(record(10))
  first.resolve(page(9))
  await tick()
  assert.deepEqual(
    f.query.getQueryData(key).pages[0].items.map(item => item.view.id),
    [10, 9],
  )
  unsubscribe()
  await f.chat.dispose()
})
test('safe upload validation categories survive the runtime boundary', async () => {
  const f = fixture()
  const operation = f.chat.createSend(
    { topicId: null, text: '' },
    { source: new Blob([]), name: 'empty', mime: 'application/octet-stream', mode: 'original' },
  )
  await assert.rejects(f.chat.send(operation), error => error.category === 'invalid-file')
  await f.chat.dispose()
})
test('explicit startup revoked rejection invokes lifecycle callback without relying on SDK onError', async () => {
  const f = fixture()
  let revoked = 0
  f.client.startUpdatesLoop = async () => {
    throw new tl.RpcError(401, 'SESSION_REVOKED')
  }
  const chat = new TelegramChat(
    f.client,
    basic,
    f.query,
    () => {},
    async () => {
      revoked++
    },
  )
  await chat.start()
  assert.equal(revoked, 1)
  await chat.dispose()
  await f.chat.dispose()
})
