import type { McpTelegramCommand } from '../../../src/services/tauri/mcp-client'
import type { BaseTelegramClient, tl } from '@mtcute/web'

import { Long } from '@mtcute/web'
import { afterEach, expect, test, vi } from 'vitest'

import { queryClient } from '../../../src/lib/query-client'
import { executeMcpTelegramCommand, type McpTelegramContext } from '../../../src/services/mcp/telegram'
import { mcp } from '../../../src/services/tauri/mcp-client'
import { TelegramChat, TelegramChatError } from '../../../src/services/telegram/chat'
import * as chatFiles from '../../../src/services/telegram/chat-files'
import { groupIdentity, type SavedTelegramGroup } from '../../../src/services/telegram/group'
import { deferred } from '../telegram/fixtures'

const saved: SavedTelegramGroup = {
  version: 1,
  accountId: '1',
  kind: 'supergroup',
  id: '123',
  title: 'Selected group',
  accessHash: '99',
  forum: true,
}
const topic = (id: number, hidden = false, closed = false) => ({
  _: 'forumTopic',
  id,
  title: id === 1 ? 'General' : `Topic ${id}`,
  date: 100,
  topMessage: id,
  readInboxMaxId: 0,
  readOutboxMaxId: 0,
  unreadCount: 0,
  unreadMentionsCount: 0,
  hidden,
  closed,
})

function fixture(forum = true) {
  const group: SavedTelegramGroup = forum
    ? saved
    : { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Selected group' }
  const call = vi.fn(async (request: tl.RpcMethod): Promise<unknown> => {
    switch (request._) {
      case 'messages.getPeerDialogs':
        return {
          dialogs: [
            { _: 'dialog', peer: forum ? { _: 'peerChannel', channelId: 123 } : { _: 'peerChat', chatId: 123 } },
          ],
          chats: [
            { _: forum ? 'channel' : 'chat', id: 123, title: 'Selected group' },
            { _: 'channel', id: 999, title: 'UNRELATED PRIVATE GROUP', accessHash: Long.ONE },
          ],
          users: [{ id: 999, firstName: 'UNRELATED PERSON' }],
        }
      case 'messages.getForumTopics':
        return {
          topics: request.offsetTopic === 0 ? [topic(1), topic(2, true)] : request.offsetTopic === 2 ? [topic(42)] : [],
          count: 3,
          messages: [],
          chats: [{ title: 'UNRELATED PRIVATE GROUP' }],
          users: [],
        }
      case 'messages.getForumTopicsByID':
        return { topics: [topic(request.topics[0])], messages: [], chats: [], users: [] }
      case 'messages.sendMessage':
        return { _: 'updateShortSentMessage', id: 913, date: 100, out: true, pts: 1, ptsCount: 1 }
      default:
        throw new Error('UNRELATED PRIVATE GROUP: unexpected request')
    }
  })
  const client = {
    call,
    timers: { cancel: async () => {} },
    storage: {
      self: { getCached: () => ({ userId: 1 }) },
      peers: {
        getCompleteById: async (id: number) =>
          id === 1
            ? { _: 'user', id: 1, firstName: 'Self' }
            : { _: forum ? 'channel' : 'chat', id: 123, title: 'Selected group', accessHash: Long.ONE },
      },
    },
    handleClientUpdate() {},
  } as unknown as BaseTelegramClient
  const chat = new TelegramChat(client, group, queryClient)
  const context: McpTelegramContext = { chat, group: { group: groupIdentity(group), status: 'connected' }, busy: false }
  const run = (command: McpTelegramCommand) => executeMcpTelegramCommand(command, () => context)
  const send = (
    args: Partial<Extract<McpTelegramCommand, { tool: 'send_telegram_message' }>['arguments']> = {},
  ): McpTelegramCommand => ({
    tool: 'send_telegram_message',
    requestId: 'send',
    deadlineAt: Date.now() + 120_000,
    arguments: { groupId: groupIdentity(group).id, topicId: forum ? 1 : null, text: 'hello', ...args },
  })
  return { chat, context, call, run, send }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  queryClient.clear()
})

test('discovery projects only the selected group and all visible topics, with no history reads', async () => {
  const f = fixture()
  const result = await f.run({
    tool: 'list_telegram_destinations',
    requestId: 'list',
    deadlineAt: Date.now() + 30_000,
    arguments: {},
  })
  expect(result).toStrictEqual({
    group: { id: '-1000000000123', title: 'Selected group', hasTopics: true },
    destinations: [
      { topicId: 1, title: 'General', closed: false },
      { topicId: 42, title: 'Topic 42', closed: false },
    ],
  })
  expect(JSON.stringify(result)).not.toContain('UNRELATED')
  for (const [request] of f.call.mock.calls) {
    if (request._ === 'messages.getPeerDialogs') expect(request.peers).toHaveLength(1)
    else expect(request).toMatchObject({ _: 'messages.getForumTopics', peer: { channelId: 123 } })
  }
})

test('nonforum discovery returns one explicit null topic and plain text sends stay scoped', async () => {
  const f = fixture(false)
  const result = await f.run({
    tool: 'list_telegram_destinations',
    requestId: 'list',
    deadlineAt: Date.now() + 30_000,
    arguments: {},
  })
  expect(result).toMatchObject({ destinations: [{ topicId: null, title: 'Selected group', closed: false }] })
  expect(await f.run(f.send())).toStrictEqual({ groupId: '-123', topicId: null, messageId: 913 })
  expect(f.call.mock.calls.find(([request]) => request._ === 'messages.sendMessage')?.[0]).toMatchObject({
    peer: { _: 'inputPeerChat', chatId: 123 },
    message: 'hello',
  })
})

test('other group IDs are rejected before provider calls or file access, without revealing the selected group', async () => {
  const f = fixture()
  const read = vi.spyOn(mcp, 'readTelegramAttachment')
  await expect(f.run(f.send({ groupId: '-1000000000999', fileName: 'test.txt' }))).rejects.toThrow(
    'That group is not selected.',
  )
  expect(read).not.toHaveBeenCalled()
  expect(f.call).not.toHaveBeenCalled()
})

test('unavailable Telegram and expired requests cannot read a file or send', async () => {
  const f = fixture()
  const read = vi.spyOn(mcp, 'readTelegramAttachment')
  f.context.busy = true
  await expect(f.run(f.send({ fileName: 'test.txt' }))).rejects.toThrow('Telegram is unavailable')
  f.context.busy = false
  await expect(f.run({ ...f.send(), deadlineAt: Date.now() - 1 })).rejects.toThrow('expired')
  expect(read).not.toHaveBeenCalled()
  expect(f.call).not.toHaveBeenCalled()
})

test('a selection change during discovery cannot return the previous group', async () => {
  const f = fixture()
  const pending = deferred<Awaited<ReturnType<TelegramChat['fetchSummary']>>>()
  vi.spyOn(f.chat, 'fetchSummary').mockReturnValue(pending.promise)
  const result = f.run({
    tool: 'list_telegram_destinations',
    requestId: 'list',
    deadlineAt: Date.now() + 30_000,
    arguments: {},
  })
  const assertion = expect(result).rejects.toThrow('Telegram is unavailable')
  f.context.group = { group: { id: '-999', title: 'UNRELATED', hasTopics: false }, status: 'connected' }
  pending.resolve({ title: 'Previous group' } as Awaited<ReturnType<TelegramChat['fetchSummary']>>)
  await assertion
})

test('missing and hidden topics never fall back to General or read the attachment', async () => {
  const f = fixture()
  const read = vi.spyOn(mcp, 'readTelegramAttachment')
  const lookup = vi.spyOn(f.chat, 'fetchTopic').mockResolvedValue(null)
  await expect(f.run(f.send({ topicId: 42, fileName: 'test.txt' }))).rejects.toThrow('topic is unavailable')
  lookup.mockResolvedValue({ id: 42, hidden: true } as Awaited<ReturnType<TelegramChat['fetchTopic']>>)
  await expect(f.run(f.send({ topicId: 42, fileName: 'test.txt' }))).rejects.toThrow('topic is unavailable')
  expect(read).not.toHaveBeenCalled()
  expect(f.call.mock.calls.some(([r]) => r._ === 'messages.sendMessage')).toBe(false)
})

test('file-only and captioned sends preserve bytes and use the existing mutation callbacks', async () => {
  const f = fixture()
  const bytes = new Uint8Array([0, 1, 255, 10])
  const read = vi.spyOn(mcp, 'readTelegramAttachment').mockResolvedValue(bytes.buffer)
  const send = vi.spyOn(f.chat, 'send').mockImplementation(async (operation, options) => {
    expect(f.chat.cache.outgoing().some(item => item.operation.id === operation.id)).toBe(true)
    expect(operation.attachment).toMatchObject({ mode: 'original', name: 'report.bin' })
    expect(new Uint8Array(await operation.attachment!.source.arrayBuffer())).toEqual(bytes)
    expect(options?.signal?.aborted).toBe(false)
    throw new TelegramChatError('unknown-send')
  })
  for (const text of [undefined, 'caption']) {
    await expect(f.run(f.send({ text, fileName: 'report.bin' }))).rejects.toThrow('Do not automatically resend')
  }
  expect(read).toHaveBeenCalledWith('send')
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.map(([operation]) => operation.text)).toEqual(['', 'caption'])
})

test('raw provider errors never expose other groups and are not retried', async () => {
  const f = fixture()
  f.call.mockRejectedValue(new Error('UNRELATED PRIVATE GROUP accessHash=secret'))
  await expect(f.run(f.send())).rejects.toThrow('Could not reach Telegram')
  expect(f.call).toHaveBeenCalledTimes(1)
})

test('photos default to media and asFile preserves the original document path', async () => {
  const f = fixture()
  const bytes = new Uint8Array([255, 216, 255, 0])
  vi.spyOn(mcp, 'readTelegramAttachment').mockResolvedValue(bytes.buffer)
  const send = vi.spyOn(f.chat, 'send').mockRejectedValue(new TelegramChatError('restricted'))
  for (const asFile of [undefined, false, true]) {
    await expect(f.run(f.send({ fileName: 'photo.jpg', asFile }))).rejects.toThrow()
  }
  expect(send.mock.calls.map(([op]) => [op.attachment?.mode, op.attachment?.mime])).toEqual([
    ['media', 'image/jpeg'],
    ['media', 'image/jpeg'],
    ['original', 'image/jpeg'],
  ])
})

test('MP4 media needs decoded metadata; asFile bypasses probing and failed probes fall back to documents', async () => {
  const f = fixture()
  vi.spyOn(mcp, 'readTelegramAttachment').mockResolvedValue(new Uint8Array([1]).buffer)
  const video = { compatible: true as const, width: 320, height: 240, duration: 2 }
  const probe = vi.spyOn(chatFiles, 'probeVideo').mockResolvedValueOnce(video).mockResolvedValueOnce(undefined)
  const send = vi.spyOn(f.chat, 'send').mockRejectedValue(new TelegramChatError('restricted'))
  for (const asFile of [false, true, false]) {
    await expect(f.run(f.send({ fileName: 'video.mp4', asFile }))).rejects.toThrow()
  }
  expect(probe).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.map(([op]) => op.attachment?.mode)).toEqual(['media', 'original', 'original'])
  expect(send.mock.calls[0][0].attachment?.video).toEqual(video)
})

test('fresh topic permissions replace stale list data before sending', async () => {
  const f = fixture()
  const old = await f.chat.fetchTopic(42)
  queryClient.setQueryData(f.chat.cache.keys.topics(), {
    pages: [{ items: [old], serverCount: 1 }],
    pageParams: [null],
  })
  vi.spyOn(f.chat, 'fetchTopic').mockResolvedValue({ ...old!, closed: true })
  await expect(f.run(f.send({ topicId: 42 }))).rejects.toThrow('does not allow')
  expect(f.chat.cache.topic(42)?.closed).toBe(true)
  expect(f.call.mock.calls.some(([r]) => r._ === 'messages.sendMessage')).toBe(false)
})

test('deadline cancellation prevents a late file read from starting a send', async () => {
  vi.useFakeTimers()
  const f = fixture()
  const read = deferred<ArrayBuffer>()
  const started = deferred()
  vi.spyOn(mcp, 'readTelegramAttachment').mockImplementation(() => {
    started.resolve()
    return read.promise
  })
  const send = vi.spyOn(f.chat, 'send')
  const result = f.run(f.send({ fileName: 'report.bin' }))
  const assertion = expect(result).rejects.toThrow('Do not automatically resend')
  await started.promise
  await vi.advanceTimersByTimeAsync(110_001)
  read.resolve(new Uint8Array([1]).buffer)
  await assertion
  expect(send).not.toHaveBeenCalled()
})
