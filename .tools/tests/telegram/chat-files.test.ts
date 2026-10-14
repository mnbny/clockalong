import type { AvatarReference } from '../../../src/services/telegram/chat-data'

import { type ITelegramClient, Long, tl } from '@mtcute/web'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, test, vi } from 'vitest'

import {
  type AttachmentInput,
  downloadAvatar,
  downloadFile,
  downloadPreview,
  prepareAttachment,
  TelegramFileError,
} from '../../../src/services/telegram/chat-files'
import { deferred } from './fixtures'

afterEach(() => vi.restoreAllMocks())

const PART = 512 * 1024
const signal = () => new AbortController().signal
const location: tl.RawInputDocumentFileLocation = {
  _: 'inputDocumentFileLocation',
  id: Long.ONE,
  accessHash: Long.ONE,
  fileReference: new Uint8Array([1]),
  thumbSize: '',
}
const ref = (parts = 12) => ({ location, dcId: 2, size: PART * parts, mediaId: '1', messageId: 7 })
const expired = () => new tl.RpcError(400, 'FILE_REFERENCE_EXPIRED')
const category = (expected: TelegramFileError['category']) => (error: unknown) =>
  error instanceof TelegramFileError && error.category === expected && !('cause' in error)

// Download tests replace only the SDK transport; mtcute still runs its real stream workers.
function clientFor(handler: (request: Extract<tl.RpcMethod, { _: 'upload.getFile' }>) => Promise<unknown>, pool = 4) {
  return {
    getPrimaryDcId: async () => 2,
    getPoolSize: async () => pool,
    log: { debug() {} },
    call: handler,
  } as unknown as ITelegramClient
}

test('bounded download awaits slow sink, preserves order despite out-of-order workers, and closes', async () => {
  let requested = 0
  let written = 0
  let ahead = 0
  let closed = false
  const progress: [number, number][] = []
  const completed: number[] = []
  const client = clientFor(async request => {
    requested++
    ahead = Math.max(ahead, requested - written)
    const index = Number(request.offset) / PART
    await delay(index === 0 ? 110 : 1)
    completed.push(index)
    return { _: 'upload.file', bytes: new Uint8Array(PART).fill(index) }
  })
  const sink = new WritableStream({
    async write(chunk) {
      expect(chunk.length).toBe(PART)
      expect(chunk[0]).toBe(written)
      await delay(3)
      written++
    },
    close() {
      closed = true
    },
  })
  await downloadFile(
    client,
    ref(),
    { sink, signal: signal(), onProgress: (...args) => progress.push(args) },
    async () => null,
  )
  expect(written).toBe(12)
  expect(completed[0]).not.toBe(0)
  expect(ahead <= 4, `in-flight and buffered chunks peaked at ${ahead}`).toBeTruthy()
  expect(closed).toBe(true)
  expect(sink.locked).toBe(false)
  expect(progress.slice(-1)[0]).toStrictEqual([12 * PART, 12 * PART])
})

test('abort while sink and SDK throttles are blocked stops work and requests sink cleanup', async () => {
  const controller = new AbortController()
  const writing = deferred()
  const release = deferred()
  const full = deferred()
  let requested = 0
  let aborted = false
  const client = clientFor(async () => {
    requested++
    if (requested === 4) full.resolve()
    return { _: 'upload.file', bytes: new Uint8Array(PART) }
  })
  const sink = new WritableStream({
    async write() {
      writing.resolve()
      await release.promise
    },
    abort(error) {
      aborted = error.category === 'aborted'
    },
  })
  const pending = downloadFile(client, ref(100), { sink, signal: controller.signal }, async () => null)
  await writing.promise
  await full.promise
  expect(requested).toBe(4)
  controller.abort(new Error('private cancellation reason'))
  await expect(pending).rejects.toSatisfy(category('aborted'))
  release.resolve()
  await delay(10)
  expect(requested).toBe(4)
  expect(aborted).toBe(true)
  expect(sink.locked).toBe(false)
})

test('expired file reference refreshes once and resumes without duplicate sink bytes', async () => {
  let refreshed = 0
  let written = 0
  const offsets: [number, number][] = []
  const firstWritten = deferred()
  const client = clientFor(async request => {
    offsets.push(['fileReference' in request.location ? request.location.fileReference[0] : 0, Number(request.offset)])
    if (
      ('fileReference' in request.location ? request.location.fileReference[0] : undefined) === 1 &&
      Number(request.offset) >= PART
    ) {
      await firstWritten.promise
      throw expired()
    }
    return { _: 'upload.file', bytes: new Uint8Array(PART).fill(Number(request.offset) / PART) }
  }, 1)
  const sink = new WritableStream({
    write(chunk) {
      expect(chunk[0]).toBe(written++)
      firstWritten.resolve()
    },
  })
  await downloadFile(client, ref(3), { sink, signal: signal() }, async () => {
    refreshed++
    return { ...ref(3), location: { ...location, fileReference: new Uint8Array([2]) } }
  })
  expect(refreshed).toBe(1)
  expect(written).toBe(3)
  const retry = offsets.find(([version]) => version === 2)
  expect(retry?.[1]).toBe(PART)
})

for (const replacement of [null, { ...ref(), mediaId: 'other' }, { ...ref(), size: 3 }]) {
  test(`reject deleted or replaced media on refresh: ${replacement?.mediaId ?? 'deleted'} / ${replacement?.size}`, async () => {
    let aborted = false
    const sink = new WritableStream({
      abort() {
        aborted = true
      },
    })
    await expect(
      downloadFile(
        clientFor(async () => {
          throw expired()
        }),
        ref(),
        { sink, signal: signal() },
        async () => replacement,
      ),
    ).rejects.toSatisfy(category('unavailable'))
    expect(aborted).toBe(true)
  })
}

test('second expired reference is unavailable and CDN limitation is a safe category', async () => {
  let refreshed = 0
  await expect(
    downloadFile(
      clientFor(async () => {
        throw expired()
      }),
      ref(),
      { sink: new WritableStream(), signal: signal() },
      async () => {
        refreshed++
        return ref()
      },
    ),
  ).rejects.toSatisfy(category('unavailable'))
  expect(refreshed).toBe(1)
  await expect(
    downloadFile(
      clientFor(async () => ({ _: 'upload.fileCdnRedirect' })),
      ref(),
      { sink: new WritableStream(), signal: signal() },
      async () => null,
    ),
  ).rejects.toSatisfy(category('cdn-unsupported'))
})

test('sink failure aborts workers, releases its lock, and hides raw errors', async () => {
  const client = clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(PART) }))
  const sink = new WritableStream({
    write() {
      throw new Error('private filename')
    },
  })
  await expect(downloadFile(client, ref(), { sink, signal: signal() }, async () => null)).rejects.toMatchObject({
    category: 'transfer-failed',
    message: expect.not.stringContaining('private'),
  })
  expect(sink.locked).toBe(false)
})

test('avatar only downloads small peer photo and returns a bounded blob', async () => {
  const avatar: AvatarReference = {
    location: { _: 'inputPeerPhotoFileLocation', peer: { _: 'inputPeerChat', chatId: 9 }, photoId: Long.ONE },
    dcId: 2,
    senderId: 'chat:9',
    photoId: '1',
  }
  const client = clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array([1, 2, 3]) }))
  expect((await downloadAvatar(client, avatar, signal())).size).toBe(3)
  await expect(
    downloadAvatar(client, { ...avatar, location: { ...avatar.location, big: true } }, signal()),
  ).rejects.toSatisfy(category('unavailable'))
  const endless = clientFor(async request => ({ _: 'upload.file', bytes: new Uint8Array(request.limit) }))
  await expect(downloadAvatar(endless, avatar, signal())).rejects.toSatisfy(category('unavailable'))
})

function uploadClient(premium = false, parts = premium ? 8000 : 4000) {
  return {
    appConfig: { get: async () => ({ upload_max_fileparts_default: parts, upload_max_fileparts_premium: parts }) },
    storage: { self: { storeFrom: async () => {} } },
    call: async (request: tl.RpcMethod) => {
      expect(request._).toBe('users.getUsers')
      return [{ _: 'user', id: 1, self: true, premium }]
    },
  } as unknown as ITelegramClient
}

const attachment = (source: Blob, mime = 'image/jpeg', mode: AttachmentInput['mode'] = 'media') => ({
  source,
  name: 'file',
  mime,
  mode,
})

test('media preserves Blob streaming source; original photo is an explicit document', async () => {
  const blob = new Blob([new Uint8Array([255, 216, 255, 0])])
  blob.arrayBuffer = () => {
    throw new Error('must not buffer entire attachment')
  }
  const photo = await prepareAttachment(uploadClient(), attachment(blob), signal())
  expect(photo).toMatchObject({ type: 'photo', fileSize: blob.size })
  expect('file' in photo && photo.file).toBe(blob)
  expect(await prepareAttachment(uploadClient(), attachment(blob, 'image/jpeg', 'original'), signal())).toMatchObject({
    type: 'document',
  })
  expect(await prepareAttachment(uploadClient(), attachment(new Blob(['not a jpeg'])), signal())).toMatchObject({
    type: 'document',
  })
})

test('PNG and nonanimated WebP classify as photos; animated WebP and unknown video stay documents', async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])])
  expect(await prepareAttachment(uploadClient(), attachment(png, 'image/png'), signal())).toMatchObject({
    type: 'photo',
  })
  const webp = new Uint8Array(32)
  webp.set(new TextEncoder().encode('RIFF'), 0)
  webp.set(new TextEncoder().encode('WEBPVP8X'), 8)
  expect(await prepareAttachment(uploadClient(), attachment(new Blob([webp]), 'image/webp'), signal())).toMatchObject({
    type: 'photo',
  })
  webp[20] = 2
  expect(await prepareAttachment(uploadClient(), attachment(new Blob([webp]), 'image/webp'), signal())).toMatchObject({
    type: 'document',
  })
  const video = attachment(new Blob(['fake test video']), 'video/mp4')
  expect(await prepareAttachment(uploadClient(), video, signal())).toMatchObject({ type: 'document' })
  const prepared = await prepareAttachment(
    uploadClient(),
    { ...video, video: { compatible: true, width: 320, height: 240, duration: 2 } },
    signal(),
  )
  expect(prepared).toMatchObject({ type: 'video', supportsStreaming: false })
})

test('upload uses lower of current server and installed SDK limits, including premium', async () => {
  for (const [premium, serverParts, maxParts] of [
    [false, 5000, 4000],
    [false, 3000, 3000],
    [true, 9000, 8000],
    [true, 7000, 7000],
  ] as const) {
    const blob = new Blob(['test'])
    Object.defineProperty(blob, 'size', { value: maxParts * PART + 1 })
    await expect(prepareAttachment(uploadClient(premium, serverParts), attachment(blob), signal())).rejects.toSatisfy(
      category('too-large'),
    )
  }
})

test('abort before preparation does no account/config reads; abort during config discards result', async () => {
  const controller = new AbortController()
  controller.abort()
  const preAbortedClient = uploadClient()
  const accountRead = vi.spyOn(preAbortedClient, 'call')
  const configRead = vi.spyOn(preAbortedClient.appConfig, 'get')
  await expect(prepareAttachment(preAbortedClient, attachment(new Blob(['a'])), controller.signal)).rejects.toSatisfy(
    category('aborted'),
  )
  expect(accountRead).not.toHaveBeenCalled()
  expect(configRead).not.toHaveBeenCalled()
  const waiting = deferred<Record<string, number>>()
  const later = new AbortController()
  const client = uploadClient()
  client.appConfig.get = () => waiting.promise
  const pending = prepareAttachment(client, attachment(new Blob(['a'])), later.signal)
  later.abort()
  await expect(pending).rejects.toSatisfy(category('aborted'))
  waiting.resolve({ upload_max_fileparts_default: 4000 })
})

test('preview downloads only a bounded thumbnail reference and preserves its bytes', async () => {
  const preview = { ...ref(), size: 4, location: { ...location, thumbSize: 'm' } }
  const bytes = new Uint8Array([255, 216, 255, 0])
  const client = clientFor(async request => {
    expect(request.location).toMatchObject({ thumbSize: 'm' })
    return { _: 'upload.file', bytes }
  })
  const blob = await downloadPreview(client, preview, signal())
  expect(blob.size).toBe(4)
  expect(blob.type).toBe('image/jpeg')
  expect(new Uint8Array(await blob.arrayBuffer())).toStrictEqual(bytes)
})

test('preview rejects full document references, unknown sizes, and oversized thumbnails before RPC', async () => {
  const client = clientFor(async () => {
    expect.fail('must not fetch an unbounded preview')
  })
  for (const invalid of [
    { ...ref(), size: 4 },
    { ...ref(), size: PART + 1, location: { ...location, thumbSize: 'm' } },
    { ...ref(), size: Infinity, location: { ...location, thumbSize: 'm' } },
    { ...ref(), size: 0, location: { ...location, thumbSize: 'm' } },
  ])
    await expect(downloadPreview(client, invalid, signal())).rejects.toSatisfy(category('unavailable'))
})

test('preview rejects incorrect size and stale reference without returning partial bytes', async () => {
  const preview = { ...ref(), size: 4, location: { ...location, thumbSize: 'm' } }
  await expect(
    downloadPreview(
      clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(5) })),
      preview,
      signal(),
    ),
  ).rejects.toSatisfy(category('unavailable'))
  await expect(
    downloadPreview(
      clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(3) })),
      preview,
      signal(),
    ),
  ).rejects.toSatisfy(category('unavailable'))
  await expect(
    downloadPreview(
      clientFor(async () => {
        throw expired()
      }),
      preview,
      signal(),
    ),
  ).rejects.toSatisfy(category('unavailable'))
  const controller = new AbortController()
  controller.abort()
  await expect(
    downloadPreview(
      clientFor(async () => expect.fail('must not fetch after abort')),
      preview,
      controller.signal,
    ),
  ).rejects.toSatisfy(category('aborted'))
})
