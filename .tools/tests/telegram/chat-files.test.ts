import type { AvatarReference } from '../../../src/services/telegram/chat-data'

import { type ITelegramClient, Long, tl } from '@mtcute/web'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, expect, test, vi } from 'vitest'

import {
  type AttachmentInput,
  downloadAvatar,
  downloadImage,
  downloadPreview,
  prepareAttachment,
  probeVideo,
  TelegramFileError,
} from '../../../src/services/telegram/chat-files'
import { deferred } from './fixtures'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const PART = 512 * 1024
const signal = () => new AbortController().signal
const location: tl.RawInputDocumentFileLocation = {
  _: 'inputDocumentFileLocation',
  id: Long.ONE,
  accessHash: Long.ONE,
  fileReference: new Uint8Array([1]),
  thumbSize: '',
}
const ref = () => ({ location, dcId: 2, size: 4, mediaId: '1' })
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

const avatarReference: AvatarReference = {
  location: { _: 'inputPeerPhotoFileLocation', peer: { _: 'inputPeerChat', chatId: 9 }, photoId: Long.ONE },
  dcId: 2,
  senderId: 'chat:9',
  photoId: '1',
}

test('full image reads validate bytes and reject oversized requests before download', async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])
  const client = clientFor(async () => ({ _: 'upload.file', bytes }))
  const result = await downloadImage(client, { ...ref(), size: bytes.length }, signal())
  expect(result.type).toBe('image/png')
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes)
  await expect(
    downloadImage(
      clientFor(async () => {
        throw new Error('must not download')
      }),
      {
        ...ref(),
        size: 21 * 1024 * 1024,
      },
      signal(),
    ),
  ).rejects.toSatisfy(category('unavailable'))
  await expect(
    downloadImage(
      clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array([1, 2, 3, 4]) })),
      ref(),
      signal(),
    ),
  ).rejects.toSatisfy(category('unavailable'))
})

test('avatar bytes preserve order when SDK workers finish out of order', async () => {
  const part = 64 * 1024
  const completed: number[] = []
  const client = clientFor(async request => {
    const index = Number(request.offset) / part
    await delay(index === 0 ? 50 : 1)
    completed.push(index)
    return { _: 'upload.file', bytes: new Uint8Array(index < 8 ? part : 0).fill(index) }
  })
  const blob = await downloadAvatar(client, avatarReference, signal())
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(completed[0]).not.toBe(0)
  expect(bytes.length).toBe(512 * 1024)
  for (let index = 0; index < 8; index++)
    expect(bytes.subarray(index * part, (index + 1) * part).every(byte => byte === index)).toBe(true)
})

test('cancelled preview discards a late chunk and aborts SDK workers', async () => {
  const controller = new AbortController()
  const started = deferred()
  const response = deferred<unknown>()
  const client = clientFor(async () => {
    started.resolve()
    return response.promise
  })
  const pending = downloadPreview(client, { ...ref(), location: { ...location, thumbSize: 'm' } }, controller.signal)
  const assertion = expect(pending).rejects.toSatisfy(category('aborted'))
  await started.promise
  controller.abort(new Error('private cancellation reason'))
  response.resolve({ _: 'upload.file', bytes: new Uint8Array(4) })
  await assertion
})

test('preview CDN and provider errors have safe categories', async () => {
  const preview = { ...ref(), location: { ...location, thumbSize: 'm' } }
  await expect(
    downloadPreview(
      clientFor(async () => ({ _: 'upload.fileCdnRedirect' })),
      preview,
      signal(),
    ),
  ).rejects.toSatisfy(category('cdn-unsupported'))
  await expect(
    downloadPreview(
      clientFor(async () => {
        throw new Error('private filename')
      }),
      preview,
      signal(),
    ),
  ).rejects.toMatchObject({
    category: 'transfer-failed',
    message: expect.not.stringContaining('private'),
  })
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

test('video probing requires a decoded MP4 frame and releases its object URL', async () => {
  const video = {
    src: '',
    videoWidth: 320,
    videoHeight: 240,
    duration: 2,
    onloadeddata: null as (() => void) | null,
    onerror: null as (() => void) | null,
    removeAttribute: vi.fn(),
    load: vi.fn(),
  }
  const started = deferred()
  vi.stubGlobal('document', {
    createElement: () => {
      started.resolve()
      return video
    },
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  expect(await probeVideo(new Blob(['not an MP4']), signal())).toBeUndefined()
  const pending = probeVideo(new Blob(['\0\0\0\u0018ftypisom']), signal())
  await started.promise
  video.onloadeddata!()
  expect(await pending).toEqual({ compatible: true, width: 320, height: 240, duration: 2 })
  expect(video.removeAttribute).toHaveBeenCalledWith('src')
  expect(revoke).toHaveBeenCalledWith('blob:test')
})

test('failed, stalled, and cancelled video probes release the decoder without reporting compatible media', async () => {
  vi.useFakeTimers()
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
  for (const outcome of ['error', 'timeout', 'abort']) {
    const started = deferred()
    const video = { src: '', onerror: null as (() => void) | null, removeAttribute: vi.fn(), load: vi.fn() }
    vi.stubGlobal('document', {
      createElement: () => {
        started.resolve()
        return video
      },
    })
    const controller = new AbortController()
    const pending = probeVideo(new Blob(['\0\0\0\u0018ftypisom']), controller.signal)
    const assertion =
      outcome === 'abort'
        ? expect(pending).rejects.toSatisfy(category('aborted'))
        : expect(pending).resolves.toBeUndefined()
    await started.promise
    if (outcome === 'error') video.onerror!()
    else if (outcome === 'abort') controller.abort()
    else await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(video.removeAttribute).toHaveBeenCalledWith('src')
  }
  expect(revoke).toHaveBeenCalledTimes(3)
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
