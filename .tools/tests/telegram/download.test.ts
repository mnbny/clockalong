import { type BaseTelegramClient, type ITelegramClient, Long } from '@mtcute/web'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { telegramDownload } from '../../../src/services/tauri/telegram-download-client'
import { TelegramChat } from '../../../src/services/telegram/chat'
import { saveToDownloads } from '../../../src/services/telegram/chat-download'
import { downloadFile, type FileReference, TelegramFileError } from '../../../src/services/telegram/chat-files'
import { deferred } from './fixtures'

const PART = 512 * 1024
let events: (string | number | number[])[][]
const chats: { chat: TelegramChat; query: QueryClient }[] = []
const signal = () => new AbortController().signal

beforeEach(() => {
  events = []
  vi.spyOn(telegramDownload, 'begin').mockImplementation(async (name, size) => {
    events.push(['begin', name, size])
    return 'handle'
  })
  vi.spyOn(telegramDownload, 'append').mockImplementation(async (handle, bytes) => {
    events.push(['append', handle, [...bytes]])
  })
  vi.spyOn(telegramDownload, 'finish').mockImplementation(async handle => {
    events.push(['finish', handle])
    return { fileName: 'report (1).txt' }
  })
  vi.spyOn(telegramDownload, 'cancel').mockImplementation(async handle => {
    events.push(['cancel', handle])
  })
})
afterEach(async () => {
  for (const { chat, query } of chats.splice(0)) {
    await chat.dispose()
    query.clear()
  }
  vi.restoreAllMocks()
})

async function write(sink: WritableStream<Uint8Array>, ...chunks: number[][]) {
  const writer = sink.getWriter()
  try {
    for (const chunk of chunks) await writer.write(new Uint8Array(chunk))
    await writer.close()
  } finally {
    writer.releaseLock()
  }
}

test('native destination awaits each chunk and publishes only after the stream closes', async () => {
  const pending = deferred()
  const started = deferred()
  vi.spyOn(telegramDownload, 'append').mockImplementation(async (handle, bytes) => {
    events.push(['append', handle, [...bytes]])
    if (bytes[0] === 1) {
      started.resolve()
      await pending.promise
    }
  })
  const saving = saveToDownloads('report.txt', 4, signal(), sink => write(sink, [1, 2], [3, 4]))
  await started.promise
  expect(events).toStrictEqual([
    ['begin', 'report.txt', 4],
    ['append', 'handle', [1, 2]],
  ])
  pending.resolve()
  expect(await saving).toStrictEqual({ fileName: 'report (1).txt' })
  expect(events.slice(2)).toStrictEqual([
    ['append', 'handle', [3, 4]],
    ['finish', 'handle'],
  ])
})

test('aborted before begin creates no native file', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(saveToDownloads('report.txt', 1, controller.signal, sink => write(sink, [1]))).rejects.toMatchObject({
    category: 'aborted',
  })
  expect(events).toStrictEqual([])
})

test('abort during native begin cancels the late handle without downloading', async () => {
  const pending = deferred<string>()
  const controller = new AbortController()
  vi.spyOn(telegramDownload, 'begin').mockImplementation(() => pending.promise)
  const saving = saveToDownloads('report.txt', 1, controller.signal, () => expect.fail('must not download'))
  controller.abort()
  pending.resolve('late-handle')
  await expect(saving).rejects.toMatchObject({ category: 'aborted' })
  expect(events).toStrictEqual([['cancel', 'late-handle']])
})

test('network failure removes the partial destination and preserves its safe error', async () => {
  const error = new TelegramFileError('transfer-failed')
  await expect(
    saveToDownloads('report.txt', 2, signal(), async sink => {
      const writer = sink.getWriter()
      await writer.write(new Uint8Array([1]))
      writer.releaseLock()
      throw error
    }),
  ).rejects.toBe(error)
  expect(events.slice(-1)[0]).toStrictEqual(['cancel', 'handle'])
  expect(events.some(event => event[0] === 'finish')).toBe(false)
})

for (const method of ['begin', 'append', 'finish'] as const) {
  test(`${method} I/O failure exposes no raw path or native error`, async () => {
    vi.spyOn(telegramDownload, method).mockImplementation(async () => {
      throw new Error('private path and attachment name')
    })
    await expect(saveToDownloads('report.txt', 1, signal(), sink => write(sink, [1]))).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof TelegramFileError &&
        error.category === 'save-failed' &&
        !('cause' in error) &&
        !error.message.includes('private'),
    )
    if (method !== 'begin') expect(events.slice(-1)[0]).toStrictEqual(['cancel', 'handle'])
  })
}

test('unfinished callback cannot publish a destination', async () => {
  await expect(saveToDownloads('report.txt', 1, signal(), async () => {})).rejects.toMatchObject({
    category: 'save-failed',
  })
  expect(events).toStrictEqual([
    ['begin', 'report.txt', 1],
    ['cancel', 'handle'],
  ])
})

test('SDK stream cancellation requests native cleanup without waiting on a blocked disk write', async () => {
  const writing = deferred()
  const releaseWrite = deferred()
  const releaseCancel = deferred()
  const controller = new AbortController()
  vi.spyOn(telegramDownload, 'append').mockImplementation(async () => {
    writing.resolve()
    await releaseWrite.promise
  })
  vi.spyOn(telegramDownload, 'cancel').mockImplementation(handle => {
    events.push(['cancel', handle])
    return releaseCancel.promise
  })
  const reference: FileReference = {
    location: {
      _: 'inputDocumentFileLocation',
      id: Long.ONE,
      accessHash: Long.ONE,
      fileReference: new Uint8Array(),
      thumbSize: '',
    },
    dcId: 2,
    size: PART * 10,
    mediaId: '1',
    messageId: 7,
  }
  const client = {
    getPrimaryDcId: async () => 2,
    getPoolSize: async () => 4,
    log: { debug() {} },
    call: async () => ({ _: 'upload.file', bytes: new Uint8Array(PART) }),
  } as unknown as ITelegramClient
  const saving = saveToDownloads('report.txt', reference.size, controller.signal, sink =>
    downloadFile(client, reference, { sink, signal: controller.signal }, async () => null),
  )
  await writing.promise
  controller.abort(new Error('private cancellation reason'))
  await expect(saving).rejects.toMatchObject({ category: 'aborted' })
  expect(events).toStrictEqual([
    ['begin', 'report.txt', reference.size],
    ['cancel', 'handle'],
  ])
  releaseWrite.resolve()
  releaseCancel.resolve()
})

function chatFixture() {
  const query = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  const chat = new TelegramChat(
    {
      getPrimaryDcId: async () => 2,
      getPoolSize: async () => 1,
      log: { debug() {} },
      call: async () => ({ _: 'upload.file', bytes: new Uint8Array([1, 2, 3]) }),
      stopUpdatesLoop: async () => {},
    } as unknown as BaseTelegramClient,
    { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Group' },
    query,
  )
  query.setQueryData(chat.cache.keys.history(null), {
    pages: [
      {
        items: [
          {
            view: { id: 7, topicId: null, attachment: { kind: 'photo', mime: 'image/jpeg' } },
            file: {
              location: {
                _: 'inputPhotoFileLocation',
                id: Long.ONE,
                accessHash: Long.ONE,
                fileReference: new Uint8Array(),
                thumbSize: 'x',
              },
              dcId: 2,
              size: 3,
              mediaId: '1',
              messageId: 7,
            },
          },
        ],
      },
    ],
    pageParams: [null],
  })
  chats.push({ chat, query })
  return { chat, query }
}

test('chat saving accepts only a cached attachment and streams to the default native destination', async () => {
  const { chat } = chatFixture()
  await expect(chat.saveDownload(999)).rejects.toMatchObject({ category: 'unavailable' })
  expect(events).toStrictEqual([])
  expect(await chat.saveDownload(7)).toStrictEqual({ fileName: 'report (1).txt' })
  expect(events).toStrictEqual([
    ['begin', 'telegram-7.jpg', 3],
    ['append', 'handle', [1, 2, 3]],
    ['finish', 'handle'],
  ])
  await chat.dispose()
})

test('group teardown cancels native saving and cannot publish a late file', async () => {
  const { chat, query } = chatFixture()
  const writing = deferred()
  const release = deferred()
  vi.spyOn(telegramDownload, 'append').mockImplementation(async () => {
    writing.resolve()
    await release.promise
  })
  const saving = chat.saveDownload(7)
  await writing.promise
  await chat.dispose()
  await expect(saving).rejects.toMatchObject({ category: 'aborted' })
  expect(events).toStrictEqual([
    ['begin', 'telegram-7.jpg', 3],
    ['cancel', 'handle'],
  ])
  expect(query.getQueryCache().getAll().length).toBe(0)
  release.resolve()
})
