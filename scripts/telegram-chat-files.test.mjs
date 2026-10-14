import { Long, tl } from '@mtcute/web'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import {
  downloadAvatar,
  downloadFile,
  downloadPreview,
  prepareAttachment,
} from '../src/services/telegram/chat-files.ts'

const PART = 512 * 1024
const signal = () => new AbortController().signal
const location = {
  _: 'inputDocumentFileLocation',
  id: Long.ONE,
  accessHash: Long.ONE,
  fileReference: new Uint8Array([1]),
  thumbSize: '',
}
const ref = (parts = 12) => ({ location, dcId: 2, size: PART * parts, mediaId: '1', messageId: 7 })
const expired = () => new tl.RpcError(400, 'FILE_REFERENCE_EXPIRED')
const category = expected => error => error.category === expected && error.cause === undefined

function clientFor(handler, pool = 4) {
  return {
    getPrimaryDcId: async () => 2,
    getPoolSize: async () => pool,
    log: { debug() {} },
    call: handler,
  }
}

function deferred() {
  let resolve
  const promise = new Promise(done => (resolve = done))
  return { promise, resolve }
}

test('bounded download awaits slow sink, preserves order despite out-of-order workers, and closes', async () => {
  let requested = 0
  let written = 0
  let ahead = 0
  let closed = false
  const progress = []
  const completed = []
  const client = clientFor(async request => {
    requested++
    ahead = Math.max(ahead, requested - written)
    const index = request.offset / PART
    await delay(index === 0 ? 110 : 1)
    completed.push(index)
    return { _: 'upload.file', bytes: new Uint8Array(PART).fill(index) }
  })
  const sink = new WritableStream({
    async write(chunk) {
      assert.equal(chunk.length, PART)
      assert.equal(chunk[0], written)
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
  assert.equal(written, 12)
  assert.notEqual(completed[0], 0)
  assert.ok(ahead <= 4, `in-flight and buffered chunks peaked at ${ahead}`)
  assert.equal(closed, true)
  assert.equal(sink.locked, false)
  assert.deepEqual(progress.at(-1), [12 * PART, 12 * PART])
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
  assert.equal(requested, 4)
  controller.abort(new Error('private cancellation reason'))
  await assert.rejects(pending, category('aborted'))
  release.resolve()
  await delay(10)
  assert.equal(requested, 4)
  assert.equal(aborted, true)
  assert.equal(sink.locked, false)
})

test('expired file reference refreshes once and resumes without duplicate sink bytes', async () => {
  let refreshed = 0
  let written = 0
  const offsets = []
  const firstWritten = deferred()
  const client = clientFor(async request => {
    offsets.push([request.location.fileReference[0], request.offset])
    if (request.location.fileReference[0] === 1 && request.offset >= PART) {
      await firstWritten.promise
      throw expired()
    }
    return { _: 'upload.file', bytes: new Uint8Array(PART).fill(request.offset / PART) }
  }, 1)
  const sink = new WritableStream({
    write(chunk) {
      assert.equal(chunk[0], written++)
      firstWritten.resolve()
    },
  })
  await downloadFile(client, ref(3), { sink, signal: signal() }, async () => {
    refreshed++
    return { ...ref(3), location: { ...location, fileReference: new Uint8Array([2]) } }
  })
  assert.equal(refreshed, 1)
  assert.equal(written, 3)
  const retry = offsets.find(([version]) => version === 2)
  assert.equal(retry[1], PART)
})

for (const replacement of [null, { ...ref(), mediaId: 'other' }, { ...ref(), size: 3 }]) {
  test(`reject deleted or replaced media on refresh: ${replacement?.mediaId ?? 'deleted'} / ${replacement?.size}`, async () => {
    let aborted = false
    const sink = new WritableStream({
      abort() {
        aborted = true
      },
    })
    await assert.rejects(
      downloadFile(
        clientFor(async () => {
          throw expired()
        }),
        ref(),
        { sink, signal: signal() },
        async () => replacement,
      ),
      category('unavailable'),
    )
    assert.equal(aborted, true)
  })
}

test('second expired reference is unavailable and CDN limitation is a safe category', async () => {
  let refreshed = 0
  await assert.rejects(
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
    category('unavailable'),
  )
  assert.equal(refreshed, 1)
  await assert.rejects(
    downloadFile(
      clientFor(async () => ({ _: 'upload.fileCdnRedirect' })),
      ref(),
      { sink: new WritableStream(), signal: signal() },
      async () => null,
    ),
    category('cdn-unsupported'),
  )
})

test('sink failure aborts workers, releases its lock, and hides raw errors', async () => {
  const client = clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(PART) }))
  const sink = new WritableStream({
    write() {
      throw new Error('private filename')
    },
  })
  await assert.rejects(
    downloadFile(client, ref(), { sink, signal: signal() }, async () => null),
    error => {
      assert.equal(error.category, 'transfer-failed')
      assert.ok(!error.message.includes('private'))
      return true
    },
  )
  assert.equal(sink.locked, false)
})

test('avatar only downloads small peer photo and returns a bounded blob', async () => {
  const avatar = {
    location: { _: 'inputPeerPhotoFileLocation', peer: { _: 'inputPeerChat', chatId: 9 }, photoId: Long.ONE },
    dcId: 2,
  }
  const client = clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array([1, 2, 3]) }))
  assert.equal((await downloadAvatar(client, avatar, signal())).size, 3)
  await assert.rejects(
    downloadAvatar(client, { ...avatar, location: { ...avatar.location, big: true } }, signal()),
    category('unavailable'),
  )
  const endless = clientFor(async request => ({ _: 'upload.file', bytes: new Uint8Array(request.limit) }))
  await assert.rejects(downloadAvatar(endless, avatar, signal()), category('unavailable'))
})

function uploadClient(premium = false, parts = premium ? 8000 : 4000) {
  return {
    appConfig: { get: async () => ({ upload_max_fileparts_default: parts, upload_max_fileparts_premium: parts }) },
    storage: { self: { storeFrom: async () => {} } },
    call: async request => {
      assert.equal(request._, 'users.getUsers')
      return [{ _: 'user', id: 1, self: true, premium }]
    },
  }
}

const attachment = (source, mime = 'image/jpeg', mode = 'media') => ({ source, name: 'file', mime, mode })

test('media preserves Blob streaming source; original photo is an explicit document', async () => {
  const blob = new Blob([new Uint8Array([255, 216, 255, 0])])
  blob.arrayBuffer = () => {
    throw new Error('must not buffer entire attachment')
  }
  const photo = await prepareAttachment(uploadClient(), attachment(blob), signal())
  assert.equal(photo.type, 'photo')
  assert.equal(photo.file, blob)
  assert.equal(photo.fileSize, blob.size)
  assert.equal(
    (await prepareAttachment(uploadClient(), attachment(blob, 'image/jpeg', 'original'), signal())).type,
    'document',
  )
  assert.equal(
    (await prepareAttachment(uploadClient(), attachment(new Blob(['not a jpeg'])), signal())).type,
    'document',
  )
})

test('PNG and nonanimated WebP classify as photos; animated WebP and unknown video stay documents', async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])])
  assert.equal((await prepareAttachment(uploadClient(), attachment(png, 'image/png'), signal())).type, 'photo')
  const webp = new Uint8Array(32)
  webp.set(new TextEncoder().encode('RIFF'), 0)
  webp.set(new TextEncoder().encode('WEBPVP8X'), 8)
  assert.equal(
    (await prepareAttachment(uploadClient(), attachment(new Blob([webp]), 'image/webp'), signal())).type,
    'photo',
  )
  webp[20] = 2
  assert.equal(
    (await prepareAttachment(uploadClient(), attachment(new Blob([webp]), 'image/webp'), signal())).type,
    'document',
  )
  const video = attachment(new Blob(['fake test video']), 'video/mp4')
  assert.equal((await prepareAttachment(uploadClient(), video, signal())).type, 'document')
  const prepared = await prepareAttachment(
    uploadClient(),
    { ...video, video: { compatible: true, width: 320, height: 240, duration: 2 } },
    signal(),
  )
  assert.equal(prepared.type, 'video')
  assert.equal(prepared.supportsStreaming, false)
})

test('upload uses lower of current server and installed SDK limits, including premium', async () => {
  for (const [premium, serverParts, maxParts] of [
    [false, 5000, 4000],
    [false, 3000, 3000],
    [true, 9000, 8000],
    [true, 7000, 7000],
  ]) {
    const blob = new Blob(['test'])
    Object.defineProperty(blob, 'size', { value: maxParts * PART + 1 })
    await assert.rejects(
      prepareAttachment(uploadClient(premium, serverParts), attachment(blob), signal()),
      category('too-large'),
    )
  }
})

test('abort before preparation does no account/config reads; abort during config discards result', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(prepareAttachment({}, attachment(new Blob(['a'])), controller.signal), category('aborted'))
  const waiting = deferred()
  const later = new AbortController()
  const client = uploadClient()
  client.appConfig.get = () => waiting.promise
  const pending = prepareAttachment(client, attachment(new Blob(['a'])), later.signal)
  later.abort()
  await assert.rejects(pending, category('aborted'))
  waiting.resolve({ upload_max_fileparts_default: 4000 })
})

test('preview downloads only a bounded thumbnail reference and preserves its bytes', async () => {
  const preview = { ...ref(), size: 4, location: { ...location, thumbSize: 'm' } }
  const bytes = new Uint8Array([255, 216, 255, 0])
  const client = clientFor(async request => {
    assert.equal(request.location.thumbSize, 'm')
    return { _: 'upload.file', bytes }
  })
  const blob = await downloadPreview(client, preview, signal())
  assert.equal(blob.size, 4)
  assert.equal(blob.type, 'image/jpeg')
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes)
})

test('preview rejects full document references, unknown sizes, and oversized thumbnails before RPC', async () => {
  const client = clientFor(async () => {
    assert.fail('must not fetch an unbounded preview')
  })
  for (const invalid of [
    { ...ref(), size: 4 },
    { ...ref(), size: PART + 1, location: { ...location, thumbSize: 'm' } },
    { ...ref(), size: Infinity, location: { ...location, thumbSize: 'm' } },
    { ...ref(), size: 0, location: { ...location, thumbSize: 'm' } },
  ])
    await assert.rejects(downloadPreview(client, invalid, signal()), category('unavailable'))
})

test('preview rejects incorrect size and stale reference without returning partial bytes', async () => {
  const preview = { ...ref(), size: 4, location: { ...location, thumbSize: 'm' } }
  await assert.rejects(
    downloadPreview(
      clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(5) })),
      preview,
      signal(),
    ),
    category('unavailable'),
  )
  await assert.rejects(
    downloadPreview(
      clientFor(async () => ({ _: 'upload.file', bytes: new Uint8Array(3) })),
      preview,
      signal(),
    ),
    category('unavailable'),
  )
  await assert.rejects(
    downloadPreview(
      clientFor(async () => {
        throw expired()
      }),
      preview,
      signal(),
    ),
    category('unavailable'),
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(downloadPreview({}, preview, controller.signal), category('aborted'))
})
