import { type InputMediaLike, type ITelegramClient, MtUnsupportedError, tl } from '@mtcute/web'
import { downloadAsIterable, getMe } from '@mtcute/web/methods.js'

import { maxTelegramImageBytes } from './attachment-image'
import { invalidTelegramSession } from './errors'

export type FileReference = {
  location: tl.TypeInputFileLocation
  dcId: number
  size: number
  mediaId: string
}

export type AttachmentInput = {
  source: File | Blob
  name: string
  mime: string
  mode: 'media' | 'original'
  /** Metadata from a real probe; MIME alone cannot establish compatible video codecs. */
  video?: {
    compatible: true
    width: number
    height: number
    duration: number
    supportsStreaming?: boolean
  }
}

const fileMessages = {
  aborted: 'Telegram file transfer was cancelled.',
  unavailable: 'This Telegram file is no longer available.',
  'session-expired': 'The Telegram session expired.',
  'cdn-unsupported': 'This Telegram file requires a CDN download that the current client does not support.',
  'too-large': 'This file exceeds the supported Telegram upload size for this account.',
  'invalid-file': 'This file cannot be prepared for Telegram.',
  'transfer-failed': 'Telegram file transfer failed.',
} as const

export class TelegramFileError extends Error {
  readonly category: keyof typeof fileMessages

  constructor(category: keyof typeof fileMessages) {
    super(fileMessages[category])
    this.name = 'TelegramFileError'
    this.category = category
  }
}

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw new TelegramFileError('aborted')
}

// Cancellation must also interrupt a blocked sink/config lookup, not only network calls.
function cancellable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new TelegramFileError('aborted'))
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(
      value => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) abort()
        else resolve(value)
      },
      error => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
    if (signal.aborted) abort()
  })
}

function safeError(error: unknown, signal: AbortSignal) {
  if (signal.aborted) return new TelegramFileError('aborted')
  if (error instanceof TelegramFileError) return error
  if (invalidTelegramSession(error)) return new TelegramFileError('session-expired')
  if (
    tl.RpcError.is(error, 'FILE_REFERENCE_EXPIRED') ||
    tl.RpcError.is(error, 'FILE_REFERENCE_INVALID') ||
    tl.RpcError.is(error, 'FILEREF_UPGRADE_NEEDED') ||
    (error instanceof MtUnsupportedError && error.message === 'File ref expired!')
  )
    return new TelegramFileError('unavailable')
  if (error instanceof MtUnsupportedError && error.message.includes('CDN redirect'))
    return new TelegramFileError('cdn-unsupported')
  return new TelegramFileError('transfer-failed')
}

const PART_BYTES = 512 * 1024
const BUFFER_BYTES = 4 * PART_BYTES

// FIFO reservations preserve the SDK's chunk order even when RPCs finish out of order.
function downloadBudget(signal: AbortSignal) {
  let reserved = 0
  const waiting: { bytes: number; resolve: () => void; reject: (error: Error) => void }[] = []
  const abort = () => {
    for (const waiter of waiting.splice(0)) waiter.reject(new TelegramFileError('aborted'))
  }
  signal.addEventListener('abort', abort, { once: true })
  return {
    reserve(bytes: number) {
      checkSignal(signal)
      if (!waiting.length && reserved + bytes <= BUFFER_BYTES) {
        reserved += bytes
        return
      }
      return new Promise<void>((resolve, reject) => waiting.push({ bytes, resolve, reject }))
    },
    release(bytes: number) {
      reserved -= bytes
      while (waiting.length && reserved + waiting[0].bytes <= BUFFER_BYTES) {
        const waiter = waiting.shift()!
        reserved += waiter.bytes
        waiter.resolve()
      }
    },
    dispose() {
      signal.removeEventListener('abort', abort)
      abort()
    },
  }
}

async function downloadFile(
  client: ITelegramClient,
  reference: FileReference,
  sink: WritableStream<Uint8Array>,
  signal: AbortSignal,
) {
  const controller = new AbortController()
  const abort = () => controller.abort(new TelegramFileError('aborted'))
  signal.addEventListener('abort', abort, { once: true })
  const budget = downloadBudget(controller.signal)
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  let committed = 0
  try {
    checkSignal(signal)
    writer = sink.getWriter()
    // No SDK stallTimeout: its timer counts deliberate sink/backpressure pauses as stalls.
    for await (const chunk of downloadAsIterable(client, reference.location, {
      dcId: reference.dcId,
      fileSize: reference.size,
      partSize: PART_BYTES / 1024,
      abortSignal: controller.signal,
      throttle: bytes => budget.reserve(bytes),
    })) {
      checkSignal(signal)
      if (committed + chunk.byteLength > reference.size) throw new TelegramFileError('unavailable')
      await cancellable(writer.write(chunk), signal)
      committed += chunk.byteLength
      budget.release(PART_BYTES)
    }
    checkSignal(signal)
    if (committed !== reference.size) throw new TelegramFileError('unavailable')
    await cancellable(writer.close(), signal)
  } catch (error) {
    const safe = safeError(error, signal)
    if (writer) {
      const cleanup = writer.abort(safe).catch(() => {})
      if (!signal.aborted) await cleanup
    }
    throw safe
  } finally {
    // SDK workers can still be awaiting throttles when its iterator exits.
    controller.abort(new TelegramFileError('aborted'))
    budget.dispose()
    signal.removeEventListener('abort', abort)
    writer?.releaseLock()
  }
}

/** The caller resolves a separate thumbnail reference, never the full attachment location. */
export async function downloadPreview(client: ITelegramClient, reference: FileReference, signal: AbortSignal) {
  checkSignal(signal)
  if (
    !Number.isSafeInteger(reference.size) ||
    reference.size <= 0 ||
    reference.size > 512 * 1024 ||
    !['inputPhotoFileLocation', 'inputDocumentFileLocation'].includes(reference.location._) ||
    !('thumbSize' in reference.location) ||
    !reference.location.thumbSize
  )
    throw new TelegramFileError('unavailable')
  return downloadImageBlob(client, reference, signal, false)
}

export async function downloadImage(client: ITelegramClient, reference: FileReference, signal: AbortSignal) {
  checkSignal(signal)
  if (
    !Number.isSafeInteger(reference.size) ||
    reference.size <= 0 ||
    reference.size > maxTelegramImageBytes ||
    !['inputPhotoFileLocation', 'inputDocumentFileLocation'].includes(reference.location._)
  )
    throw new TelegramFileError('unavailable')
  return downloadImageBlob(client, reference, signal, true)
}

async function downloadImageBlob(
  client: ITelegramClient,
  reference: FileReference,
  signal: AbortSignal,
  fullImage: boolean,
) {
  const chunks: Uint8Array<ArrayBuffer>[] = []
  await downloadFile(
    client,
    reference,
    new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(new Uint8Array(chunk))
      },
      abort() {
        chunks.length = 0
      },
    }),
    signal,
  )
  checkSignal(signal)
  const prefix = chunks[0]
  let mime = photoMime(prefix)
  if (fullImage && !mime) {
    const ascii = (start: number, end: number) => String.fromCharCode(...prefix.subarray(start, end))
    if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) mime = 'image/gif'
    else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') mime = 'image/webp'
  }
  if (fullImage && !mime) throw new TelegramFileError('unavailable')
  return new Blob(chunks, { type: mime ?? 'application/octet-stream' })
}

export async function downloadAvatar(
  client: ITelegramClient,
  reference: { location: tl.TypeInputFileLocation; dcId: number },
  signal: AbortSignal,
) {
  const controller = new AbortController()
  const abort = () => controller.abort(new TelegramFileError('aborted'))
  signal.addEventListener('abort', abort, { once: true })
  const budget = downloadBudget(controller.signal)
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    checkSignal(signal)
    if (reference.location._ !== 'inputPeerPhotoFileLocation' || reference.location.big)
      throw new TelegramFileError('unavailable')
    for await (const chunk of downloadAsIterable(client, reference.location, {
      dcId: reference.dcId,
      partSize: 64,
      limit: 1024 * 1024,
      abortSignal: controller.signal,
      throttle: bytes => budget.reserve(bytes),
    })) {
      checkSignal(signal)
      size += chunk.byteLength
      if (size > 512 * 1024) throw new TelegramFileError('unavailable')
      chunks.push(new Uint8Array(chunk))
      budget.release(64 * 1024)
    }
    checkSignal(signal)
    return new Blob(chunks, { type: 'image/jpeg' })
  } catch (error) {
    throw safeError(error, signal)
  } finally {
    controller.abort(new TelegramFileError('aborted'))
    budget.dispose()
    signal.removeEventListener('abort', abort)
  }
}

export function photoMime(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png'
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && (ascii(12, 16) !== 'VP8X' || !(bytes[20] & 2)))
    return 'image/webp'
  return null
}

export async function probeVideo(source: Blob, signal: AbortSignal): Promise<AttachmentInput['video']> {
  checkSignal(signal)
  const prefix = new Uint8Array(await source.slice(0, 12).arrayBuffer())
  checkSignal(signal)
  if (String.fromCharCode(...prefix.subarray(4, 8)) !== 'ftyp') return undefined
  // shortcut: only browser-decodable MP4; add transcoding when broader video support is needed.
  const video = document.createElement('video')
  const url = URL.createObjectURL(source)
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => {}
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(new TelegramFileError('aborted'))
      signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => resolve(undefined), 5000)
      video.onloadeddata = () => {
        const { videoWidth: width, videoHeight: height, duration } = video
        resolve(
          width > 0 && height > 0 && Number.isFinite(duration) && duration > 0
            ? { compatible: true, width, height, duration }
            : undefined,
        )
      }
      video.onerror = () => resolve(undefined)
      video.preload = 'auto'
      video.muted = true
      video.src = url
    })
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    video.onloadeddata = video.onerror = null
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Returns a streaming SDK input; the scoped runtime owns the actual send and request ID. */
export async function prepareAttachment(
  client: ITelegramClient,
  input: AttachmentInput,
  signal: AbortSignal,
): Promise<InputMediaLike> {
  try {
    checkSignal(signal)
    if (
      !(input.source instanceof Blob) ||
      !Number.isSafeInteger(input.source.size) ||
      input.source.size <= 0 ||
      !input.name.trim() ||
      !['media', 'original'].includes(input.mode)
    )
      throw new TelegramFileError('invalid-file')
    const [config, me] = await cancellable(Promise.all([client.appConfig.get(), getMe(client)]), signal)
    const serverParts = me.isPremium ? config.upload_max_fileparts_premium : config.upload_max_fileparts_default
    if (typeof serverParts !== 'number' || !Number.isSafeInteger(serverParts) || serverParts <= 0)
      throw new TelegramFileError('transfer-failed')
    const maxSize = Math.min(serverParts, me.isPremium ? 8000 : 4000) * PART_BYTES
    if (input.source.size > maxSize) throw new TelegramFileError('too-large')
    const file = {
      file: input.source,
      fileName: input.name,
      fileMime: input.mime || 'application/octet-stream',
      fileSize: input.source.size,
    }
    if (input.mode === 'original') return { type: 'document', ...file }
    const prefix = new Uint8Array(await cancellable(input.source.slice(0, 32).arrayBuffer(), signal))
    const photo = photoMime(prefix)
    if (photo && photo === input.mime) return { type: 'photo', ...file }
    const video = input.video
    if (
      input.mime === 'video/mp4' &&
      video?.compatible === true &&
      Number.isSafeInteger(video.width) &&
      video.width > 0 &&
      Number.isSafeInteger(video.height) &&
      video.height > 0 &&
      Number.isFinite(video.duration) &&
      video.duration > 0
    )
      return {
        type: 'video',
        ...file,
        width: video.width,
        height: video.height,
        duration: video.duration,
        supportsStreaming: video.supportsStreaming === true,
      }
    return { type: 'document', ...file }
  } catch (error) {
    throw safeError(error, signal)
  }
}
