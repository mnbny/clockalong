import { Long } from '@mtcute/web'
import { QueryClient } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

import { telegramDownload } from '../src/services/tauri/telegram-download-client.ts'
import { TelegramChat } from '../src/services/telegram/chat.ts'
import { saveToDownloads } from '../src/services/telegram/chat-download.ts'
import { downloadFile, TelegramFileError } from '../src/services/telegram/chat-files.ts'

const PART = 512 * 1024
let events
const signal = () => new AbortController().signal

function deferred() {
  let resolve
  const promise = new Promise(done => (resolve = done))
  return { promise, resolve }
}

beforeEach(() => {
  events = []
  mock.method(telegramDownload, 'begin', async (name, size) => {
    events.push(['begin', name, size])
    return 'handle'
  })
  mock.method(telegramDownload, 'append', async (handle, bytes) => {
    events.push(['append', handle, [...bytes]])
  })
  mock.method(telegramDownload, 'finish', async handle => {
    events.push(['finish', handle])
    return { fileName: 'report (1).txt' }
  })
  mock.method(telegramDownload, 'cancel', async handle => {
    events.push(['cancel', handle])
  })
})
afterEach(() => mock.restoreAll())

async function write(sink, ...chunks) {
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
  mock.method(telegramDownload, 'append', async (handle, bytes) => {
    events.push(['append', handle, [...bytes]])
    if (bytes[0] === 1) {
      started.resolve()
      await pending.promise
    }
  })
  const saving = saveToDownloads('report.txt', 4, signal(), sink => write(sink, [1, 2], [3, 4]))
  await started.promise
  assert.deepEqual(events, [
    ['begin', 'report.txt', 4],
    ['append', 'handle', [1, 2]],
  ])
  pending.resolve()
  assert.deepEqual(await saving, { fileName: 'report (1).txt' })
  assert.deepEqual(events.slice(2), [
    ['append', 'handle', [3, 4]],
    ['finish', 'handle'],
  ])
})

test('aborted before begin creates no native file', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    saveToDownloads('report.txt', 1, controller.signal, sink => write(sink, [1])),
    {
      category: 'aborted',
    },
  )
  assert.deepEqual(events, [])
})

test('abort during native begin cancels the late handle without downloading', async () => {
  const pending = deferred()
  const controller = new AbortController()
  mock.method(telegramDownload, 'begin', () => pending.promise)
  const saving = saveToDownloads('report.txt', 1, controller.signal, () => assert.fail('must not download'))
  controller.abort()
  pending.resolve('late-handle')
  await assert.rejects(saving, { category: 'aborted' })
  assert.deepEqual(events, [['cancel', 'late-handle']])
})

test('network failure removes the partial destination and preserves its safe error', async () => {
  const error = new TelegramFileError('transfer-failed')
  await assert.rejects(
    saveToDownloads('report.txt', 2, signal(), async sink => {
      const writer = sink.getWriter()
      await writer.write(new Uint8Array([1]))
      writer.releaseLock()
      throw error
    }),
    candidate => candidate === error,
  )
  assert.deepEqual(events.at(-1), ['cancel', 'handle'])
  assert.equal(
    events.some(event => event[0] === 'finish'),
    false,
  )
})

for (const method of ['begin', 'append', 'finish']) {
  test(`${method} I/O failure exposes no raw path or native error`, async () => {
    mock.method(telegramDownload, method, async () => {
      throw new Error('private path and attachment name')
    })
    await assert.rejects(
      saveToDownloads('report.txt', 1, signal(), sink => write(sink, [1])),
      error => error.category === 'save-failed' && error.cause === undefined && !error.message.includes('private'),
    )
    if (method !== 'begin') assert.deepEqual(events.at(-1), ['cancel', 'handle'])
  })
}

test('unfinished callback cannot publish a destination', async () => {
  await assert.rejects(
    saveToDownloads('report.txt', 1, signal(), async () => {}),
    { category: 'save-failed' },
  )
  assert.deepEqual(events, [
    ['begin', 'report.txt', 1],
    ['cancel', 'handle'],
  ])
})

test('SDK stream cancellation requests native cleanup without waiting on a blocked disk write', async () => {
  const writing = deferred()
  const releaseWrite = deferred()
  const releaseCancel = deferred()
  const controller = new AbortController()
  mock.method(telegramDownload, 'append', async () => {
    writing.resolve()
    await releaseWrite.promise
  })
  mock.method(telegramDownload, 'cancel', handle => {
    events.push(['cancel', handle])
    return releaseCancel.promise
  })
  const reference = {
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
  }
  const saving = saveToDownloads('report.txt', reference.size, controller.signal, sink =>
    downloadFile(client, reference, { sink, signal: controller.signal }, async () => null),
  )
  await writing.promise
  controller.abort(new Error('private cancellation reason'))
  await assert.rejects(saving, { category: 'aborted' })
  assert.deepEqual(events, [
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
    },
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
  return { chat, query }
}

test('chat saving accepts only a cached attachment and streams to the default native destination', async () => {
  const { chat } = chatFixture()
  await assert.rejects(chat.saveDownload(999), { category: 'unavailable' })
  assert.deepEqual(events, [])
  assert.deepEqual(await chat.saveDownload(7), { fileName: 'report (1).txt' })
  assert.deepEqual(events, [
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
  mock.method(telegramDownload, 'append', async () => {
    writing.resolve()
    await release.promise
  })
  const saving = chat.saveDownload(7)
  await writing.promise
  await chat.dispose()
  await assert.rejects(saving, { category: 'aborted' })
  assert.deepEqual(events, [
    ['begin', 'telegram-7.jpg', 3],
    ['cancel', 'handle'],
  ])
  assert.equal(query.getQueryCache().getAll().length, 0)
  release.resolve()
})
