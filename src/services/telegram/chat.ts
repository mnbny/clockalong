import type { QueryClient } from '@tanstack/react-query'

import { type BaseTelegramClient, Long, PeersIndex, tl } from '@mtcute/web'
import { closeChat, getMessages, openChat, readHistory, sendMedia, sendText } from '@mtcute/web/methods.js'

import { TelegramChatCache } from './chat-cache'
import {
  type Conversation,
  type HistoryCursor,
  type HistoryPage,
  inputPeer,
  matchesPeer,
  type MessageRecord,
  projectMessage,
  projectTopic,
  type TopicCursor,
  type TopicPage,
} from './chat-data'
import { saveToDownloads } from './chat-download'
import {
  type AttachmentInput,
  downloadAvatar,
  downloadFile,
  downloadPreview,
  prepareAttachment,
  TelegramFileError,
} from './chat-files'
import { TelegramChatImages } from './chat-images'
import { subscribeChatUpdates } from './chat-updates'
import { invalidTelegramSession } from './errors'
import { type SavedTelegramGroup } from './group'

export class TelegramChatError extends Error {
  constructor(
    readonly category: 'unavailable' | 'invalid-input' | 'restricted' | 'wait' | 'aborted' | 'network' | 'unknown-send',
    readonly waitSeconds?: number,
  ) {
    super(`Telegram chat: ${category}`)
  }
}
function safeError(error: unknown, sending = false) {
  if (error instanceof TelegramChatError || error instanceof TelegramFileError) return error
  if (error instanceof DOMException && error.name === 'AbortError')
    return new TelegramChatError(sending ? 'unknown-send' : 'aborted')
  if (tl.RpcError.is(error)) {
    if (/^(FLOOD_WAIT|SLOWMODE_WAIT)_/.test(error.text))
      return new TelegramChatError('wait', Number(error.text.split('_').pop()))
    if (/PRIVATE|FORBIDDEN|BANNED|RESTRICTED|TOPIC_CLOSED|TOPIC_DELETED/.test(error.text))
      return new TelegramChatError('restricted')
    if (/EMPTY|TOO_LONG|INVALID|FILE_PARTS/.test(error.text)) return new TelegramChatError('invalid-input')
  }
  return new TelegramChatError(sending ? 'unknown-send' : 'network')
}
let generation = 0
export type SendInput = Conversation & { text: string; entities?: readonly tl.TypeMessageEntity[]; replyToId?: number }
export type SendOperation = Readonly<
  SendInput & { id: string; scope: string; localId: number; date: number; attachment?: AttachmentInput }
>
export type OutgoingMessage = {
  operation: SendOperation
  record: MessageRecord
  serverId?: number
  error?: Error
  progress: number | null
}

export class TelegramChat {
  readonly scope: string
  readonly forum: boolean
  connection: 'offline' | 'connecting' | 'updating' | 'connected' = 'connected'
  readonly lifetime = new AbortController()
  readonly cache: TelegramChatCache
  private unsubscribe = () => {}
  private issued = new WeakSet<SendOperation>()
  private ready = true
  private confirmedReads = new Map<number | null, number>()
  private readRequests = new Map<number | null, { max: number; confirmed: number; promise: Promise<void> }>()
  private operations = new Map<string, AbortController>()
  private startup: Promise<void> = Promise.resolve()
  private localMessageId = 0
  private self: tl.RawUser | undefined
  private readonly images: TelegramChatImages

  constructor(
    private readonly client: BaseTelegramClient,
    private readonly group: SavedTelegramGroup,
    query: QueryClient,
    private readonly onChange: () => void = () => {},
    private readonly onRevoked: () => Promise<void> = async () => {},
  ) {
    this.scope = `${group.accountId}:${group.kind}:${group.id}:${++generation}`
    this.images = new TelegramChatImages(`${group.accountId}:${group.kind}:${group.id}`)
    this.forum = group.kind === 'supergroup' && group.forum
    this.cache = new TelegramChatCache(query, this.scope, () => !this.lifetime.signal.aborted)
  }
  get signal() {
    return this.lifetime.signal
  }
  get isReady() {
    return this.ready && !this.signal.aborted
  }
  private check(signal?: AbortSignal) {
    if (!this.isReady) throw new TelegramChatError('unavailable')
    signal?.throwIfAborted()
  }
  private conversation(conversation: Conversation) {
    if (
      this.forum ? !Number.isInteger(conversation.topicId) || conversation.topicId! < 1 : conversation.topicId !== null
    )
      throw new TelegramChatError('invalid-input')
  }
  private async run<T>(signal: AbortSignal | undefined, action: (signal: AbortSignal) => Promise<T>, sending = false) {
    const combined = signal ? AbortSignal.any([signal, this.signal]) : this.signal
    try {
      this.check(combined)
      const result = await action(combined)
      this.check(combined)
      return result
    } catch (error) {
      if (
        invalidTelegramSession(error) ||
        (error instanceof TelegramFileError && error.category === 'session-expired')
      ) {
        void this.onRevoked()
        throw new TelegramChatError('unavailable')
      }
      throw safeError(error, sending)
    }
  }
  start() {
    this.unsubscribe = subscribeChatUpdates(
      this.client,
      this.group,
      this.cache,
      () => this.isReady,
      () => this.refreshAccess(),
      state => {
        this.connection = state
        this.onChange()
      },
    )
    this.startup = (async () => {
      await this.client.startUpdatesLoop()
      if (this.signal.aborted) return
      const self = await this.client.storage.peers.getCompleteById(Number(this.group.accountId))
      if (self?._ === 'user') this.self = self
      if (this.signal.aborted) return
      if (this.group.kind === 'supergroup') await openChat(this.client, inputPeer(this.group))
    })().catch(error => {
      if (this.signal.aborted) return
      if (invalidTelegramSession(error) || (error instanceof TelegramFileError && error.category === 'session-expired'))
        void this.onRevoked()
      else {
        this.ready = false
        this.onChange()
      }
    })
    return this.startup
  }
  channelGap(id: number) {
    if (this.group.kind === 'supergroup' && Number(this.group.id) === id) void this.cache.recover()
  }
  private async refreshAccess() {
    try {
      const summary = await this.fetchSummary()
      this.cache.setSummary(summary)
    } catch (error) {
      if (error instanceof TelegramChatError && (error.category === 'restricted' || error.category === 'unavailable')) {
        this.ready = false
        this.onChange()
      }
      // A transport failure keeps cached data and lets the next explicit read retry.
    }
  }
  async fetchHistory(
    conversation: Conversation,
    before: HistoryCursor | null,
    signal?: AbortSignal,
  ): Promise<HistoryPage> {
    this.conversation(conversation)
    return this.run(signal, async signal => {
      const common = {
        peer: inputPeer(this.group),
        offsetId: before?.id ?? 0,
        offsetDate: before?.date ?? 0,
        addOffset: 0,
        limit: 50,
        maxId: 0,
        minId: 0,
        hash: Long.ZERO,
      }
      const response = await this.client.call(
        this.forum
          ? { _: 'messages.getReplies', ...common, msgId: conversation.topicId! }
          : { _: 'messages.getHistory', ...common },
        { abortSignal: signal },
      )
      if (response._ === 'messages.messagesNotModified') return { items: [] }
      const peers = PeersIndex.from(response)
      const last = response.messages[response.messages.length - 1]
      const cursor =
        last && last._ !== 'messageEmpty'
          ? { id: last.id, date: last.date }
          : last
            ? { id: last.id, date: 0 }
            : undefined
      return {
        items: response.messages
          .map(raw => projectMessage(this.group, raw, peers))
          .filter(
            (item): item is MessageRecord =>
              !!item && !this.cache.isDeleted(item.view.id) && item.view.topicId === conversation.topicId,
          ),
        nextBefore: cursor && cursor.id !== before?.id ? cursor : undefined,
        serverCount: 'count' in response ? response.count : response.messages.length,
        countExact: !('inexact' in response && response.inexact),
      }
    })
  }
  async fetchTopics(offset: TopicCursor | null, signal?: AbortSignal): Promise<TopicPage> {
    if (!this.forum) throw new TelegramChatError('invalid-input')
    return this.run(signal, async signal => {
      const response = await this.client.call(
        {
          _: 'messages.getForumTopics',
          peer: inputPeer(this.group),
          offsetDate: offset?.date ?? 0,
          offsetId: offset?.id ?? 0,
          offsetTopic: offset?.topic ?? 0,
          limit: 50,
        },
        { abortSignal: signal },
      )
      const short = response.topics.filter(topic => topic._ === 'forumTopic' && topic.short).map(topic => topic.id)
      const full = short.length
        ? await this.client.call(
            { _: 'messages.getForumTopicsByID', peer: inputPeer(this.group), topics: short },
            { abortSignal: signal },
          )
        : null
      const topics = response.topics
        .map(topic =>
          topic._ === 'forumTopic' && topic.short ? full?.topics.find(candidate => candidate.id === topic.id) : topic,
        )
        .filter((topic): topic is tl.RawForumTopic => topic?._ === 'forumTopic' && !topic.short)
      const last = topics[topics.length - 1]
      const message = last
        ? [...response.messages, ...(full?.messages ?? [])].find(message => message.id === last.topMessage)
        : undefined
      const date = response.orderByCreateDate
        ? last?.date
        : message && message._ !== 'messageEmpty'
          ? message.date
          : last?.date
      const next = last ? { id: last.topMessage, topic: last.id, date: date ?? 0 } : undefined
      return {
        items: topics.map(projectTopic),
        serverCount: response.count,
        nextOffset:
          next && (next.id !== offset?.id || next.topic !== offset.topic || next.date !== offset.date)
            ? next
            : undefined,
      }
    })
  }
  fetchSummary(signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const response = await this.client.call(
        { _: 'messages.getPeerDialogs', peers: [{ _: 'inputDialogPeer', peer: inputPeer(this.group) }] },
        { abortSignal: signal },
      )
      const dialog = response.dialogs.find(dialog => dialog._ === 'dialog' && matchesPeer(this.group, dialog.peer))
      const chat = response.chats.find(
        chat =>
          String(chat.id) === this.group.id && (this.group.kind === 'basic' ? chat._ === 'chat' : chat._ === 'channel'),
      )
      if (
        !dialog ||
        dialog._ !== 'dialog' ||
        !chat ||
        (chat._ !== 'chat' && chat._ !== 'channel') ||
        chat.left ||
        ('deactivated' in chat && chat.deactivated) ||
        ('migratedTo' in chat && chat.migratedTo) ||
        ('bannedRights' in chat && chat.bannedRights?.viewMessages)
      ) {
        this.ready = false
        this.onChange()
        throw new TelegramChatError('unavailable')
      }
      const exempt = !!chat.creator || !!chat.adminRights
      const rights = [chat.defaultBannedRights, ...('bannedRights' in chat ? [chat.bannedRights] : [])].filter(
        right => right && (!right.untilDate || right.untilDate > Date.now() / 1000),
      )
      const banned = (field: 'sendMessages' | 'sendPlain' | 'sendPhotos' | 'sendDocs' | 'sendVideos') =>
        !exempt && rights.some(right => right?.[field])
      return {
        title: chat.title,
        forum: this.forum,
        topMessage: dialog.topMessage,
        readInboxMaxId: dialog.readInboxMaxId,
        readOutboxMaxId: dialog.readOutboxMaxId,
        unreadCount: dialog.unreadCount,
        unreadMentionsCount: dialog.unreadMentionsCount,
        unreadMark: !!dialog.unreadMark,
        refreshedAt: Date.now(),
        canSendText: !banned('sendMessages') && !banned('sendPlain'),
        canSendPhotos: !banned('sendMessages') && !banned('sendPhotos'),
        canSendDocuments: !banned('sendMessages') && !banned('sendDocs'),
        canSendVideos: !banned('sendMessages') && !banned('sendVideos'),
        canSendInClosedTopics: !!chat.creator || !!chat.adminRights?.manageTopics,
      }
    })
  }
  fetchTopic(topicId: number, signal?: AbortSignal) {
    this.conversation({ topicId })
    return this.run(signal, async signal => {
      const response = await this.client.call(
        { _: 'messages.getForumTopicsByID', peer: inputPeer(this.group), topics: [topicId] },
        { abortSignal: signal },
      )
      const topic = response.topics.find(topic => topic.id === topicId)
      if (topic?._ === 'forumTopic' && topic.short) throw new TelegramChatError('network')
      return topic?._ === 'forumTopic' && !topic.short ? projectTopic(topic) : null
    })
  }
  fetchReply(messageId: number, signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const source = this.cache.findMessage(messageId)?.view
      if (!source?.replyToId || source.replyOutsideGroup || this.cache.isDeleted(source.replyToId)) return null
      const cached = this.cache.findMessage(source.replyToId)?.view
      if (cached) return cached.topicId === source.topicId ? cached : null
      const [message] = await getMessages(this.client, inputPeer(this.group), [source.replyToId])
      this.check(signal)
      const record = message ? projectMessage(this.group, message.raw, message._peers) : null
      return record?.view.id === source.replyToId &&
        record.view.topicId === source.topicId &&
        !this.cache.isDeleted(source.replyToId)
        ? record.view
        : null
    })
  }
  createSend(input: SendInput, attachment?: AttachmentInput): SendOperation {
    this.check()
    this.conversation(input)
    const random = crypto.getRandomValues(new Uint32Array(2))
    const id = Long.fromBits(random[0], random[1]).toString()
    const operation = Object.freeze({
      ...input,
      entities: input.entities ? Object.freeze(input.entities.map(entity => Object.freeze({ ...entity }))) : undefined,
      attachment: attachment
        ? Object.freeze({ ...attachment, video: attachment.video ? Object.freeze({ ...attachment.video }) : undefined })
        : undefined,
      scope: this.scope,
      id: id === '0' ? '1' : id,
      localId: --this.localMessageId,
      date: Math.floor(Date.now() / 1000),
    })
    this.issued.add(operation)
    return operation
  }
  beginSend(operation: SendOperation) {
    if (!this.issued.has(operation) || operation.scope !== this.scope) throw new TelegramChatError('invalid-input')
    const record = projectMessage(
      this.group,
      {
        _: 'message',
        id: operation.localId,
        date: operation.date,
        message: operation.text,
        entities: operation.entities ? [...operation.entities] : undefined,
        out: true,
        peerId:
          this.group.kind === 'basic'
            ? { _: 'peerChat', chatId: Number(this.group.id) }
            : { _: 'peerChannel', channelId: Number(this.group.id) },
        fromId: { _: 'peerUser', userId: Number(this.group.accountId) },
        replyTo: operation.replyToId ? { _: 'messageReplyHeader', replyToMsgId: operation.replyToId } : undefined,
      },
      PeersIndex.from({ users: this.self ? [this.self] : [], chats: [] }),
    )!
    record.view.topicId = operation.topicId
    if (record.view.sender && !record.view.sender.name) record.view.sender.name = 'You'
    if (operation.attachment) {
      const attachment = operation.attachment
      record.view.attachment = {
        kind: attachment.mode === 'media' ? (attachment.video ? 'video' : 'photo') : 'document',
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.source.size,
        spoiler: false,
        downloadable: false,
      }
    }
    this.cache.beginSend(operation, record)
  }
  async send(
    operation: SendOperation,
    options: { signal?: AbortSignal; onProgress?: (uploaded: number, total: number) => void } = {},
  ) {
    if (!this.issued.has(operation) || operation.scope !== this.scope || this.operations.has(operation.id))
      throw new TelegramChatError('invalid-input')
    this.check()
    if (this.connection === 'offline' || this.connection === 'connecting') throw new TelegramChatError('unavailable')
    this.conversation(operation)
    if (operation.replyToId && this.cache.findMessage(operation.replyToId)?.view.topicId !== operation.topicId)
      throw new TelegramChatError('invalid-input')
    if (
      operation.topicId &&
      this.cache.topic(operation.topicId)?.closed &&
      !this.cache.summary()?.canSendInClosedTopics
    )
      throw new TelegramChatError('restricted')
    if (!operation.attachment && this.cache.summary()?.canSendText === false) throw new TelegramChatError('restricted')
    const controller = new AbortController()
    this.operations.set(operation.id, controller)
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
    try {
      return await this.run(
        signal,
        async signal => {
          const replyTo =
            operation.replyToId ?? (operation.topicId && operation.topicId !== 1 ? operation.topicId : undefined)
          const params = {
            randomId: Long.fromString(operation.id),
            abortSignal: signal,
            replyTo,
            threadId:
              operation.replyToId && operation.topicId && operation.topicId !== 1 ? operation.topicId : undefined,
          }
          const text = operation.entities
            ? { text: operation.text, entities: operation.entities.map(entity => ({ ...entity })) }
            : operation.text
          if (operation.entities?.some(entity => 'userId' in entity && !this.cache.hasSender(`user:${entity.userId}`)))
            throw new TelegramChatError('invalid-input')
          const prepared = operation.attachment
            ? await prepareAttachment(this.client, operation.attachment, signal)
            : null
          this.check(signal)
          if (prepared && typeof prepared === 'object' && 'type' in prepared) {
            const summary = this.cache.summary()
            if (
              (prepared.type === 'photo' && summary?.canSendPhotos === false) ||
              (prepared.type === 'video' && summary?.canSendVideos === false) ||
              (prepared.type === 'document' && summary?.canSendDocuments === false)
            )
              throw new TelegramChatError('restricted')
          }
          let finalStarted = !prepared
          let sent
          try {
            sent = prepared
              ? await sendMedia(this.client, inputPeer(this.group), prepared, {
                  ...params,
                  caption: text,
                  progressCallback: (done, total) => {
                    if (done >= total) finalStarted = true
                    options.onProgress?.(done, total)
                  },
                })
              : await sendText(this.client, inputPeer(this.group), text, params)
          } catch (error) {
            if (signal.aborted) throw new TelegramChatError(finalStarted ? 'unknown-send' : 'aborted')
            throw error
          }
          this.check(signal)
          const record = projectMessage(this.group, sent.raw, sent._peers)
          if (!record) throw new TelegramChatError('unknown-send')
          // Short send responses can omit the forum header; the verified operation supplies it.
          record.view.topicId = operation.topicId
          return record
        },
        true,
      )
    } finally {
      this.operations.delete(operation.id)
    }
  }
  cancel(operationId: string) {
    this.operations.get(operationId)?.abort()
  }
  acknowledgeRead(conversation: Conversation, maxId: number) {
    this.check()
    this.conversation(conversation)
    if (this.connection === 'offline' || this.connection === 'connecting') throw new TelegramChatError('unavailable')
    if (!Number.isInteger(maxId) || maxId < 1 || this.cache.findMessage(maxId)?.view.topicId !== conversation.topicId)
      throw new TelegramChatError('invalid-input')
    const existing = this.readRequests.get(conversation.topicId)
    if (existing) {
      existing.max = Math.max(existing.max, maxId)
      return existing.promise
    }
    const request = {
      max: maxId,
      confirmed: Math.max(
        this.confirmedReads.get(conversation.topicId) ?? 0,
        (conversation.topicId === null
          ? this.cache.summary()?.readInboxMaxId
          : this.cache.topic(conversation.topicId)?.readInboxMaxId) ?? 0,
      ),
      promise: Promise.resolve(),
    }
    request.promise = this.run(undefined, async signal => {
      while (request.max > request.confirmed) {
        const target = request.max
        if (this.forum)
          await this.client.call(
            {
              _: 'messages.readDiscussion',
              peer: inputPeer(this.group),
              msgId: conversation.topicId!,
              readMaxId: target,
            },
            { abortSignal: signal },
          )
        else await readHistory(this.client, inputPeer(this.group), { maxId: target, clearMentions: false })
        this.check(signal)
        request.confirmed = target
        this.confirmedReads.set(conversation.topicId, target)
      }
    }).finally(() => this.readRequests.delete(conversation.topicId))
    this.readRequests.set(conversation.topicId, request)
    return request.promise
  }
  download(
    messageId: number,
    options: {
      sink: WritableStream<Uint8Array>
      signal?: AbortSignal
      onProgress?: (downloaded: number, total: number) => void
    },
  ) {
    return this.run(options.signal, async signal => {
      const ref = this.cache.findMessage(messageId)?.file
      if (!ref) throw new TelegramChatError('unavailable')
      await downloadFile(
        this.client,
        ref,
        { ...options, signal },
        async () => (await this.refreshMessage(messageId, signal))?.file ?? null,
      )
    })
  }
  saveDownload(
    messageId: number,
    options: { signal?: AbortSignal; onProgress?: (downloaded: number, total: number) => void } = {},
  ) {
    return this.run(options.signal, async signal => {
      const record = this.cache.findMessage(messageId)
      if (!record?.file) throw new TelegramChatError('unavailable')
      const attachment = record.view.attachment
      const extension = attachment?.kind === 'photo' ? '.jpg' : attachment?.mime === 'video/mp4' ? '.mp4' : ''
      const fileName = attachment?.name || `telegram-${messageId}${extension}`
      return saveToDownloads(fileName, record.file.size, signal, sink => {
        if (this.cache.findMessage(messageId)?.file?.mediaId !== record.file?.mediaId)
          throw new TelegramChatError('unavailable')
        return this.download(messageId, { ...options, signal, sink })
      })
    })
  }
  private async refreshMessage(messageId: number, signal: AbortSignal) {
    if (!this.cache.findMessage(messageId)) throw new TelegramChatError('unavailable')
    const [message] = await getMessages(this.client, inputPeer(this.group), [messageId])
    this.check(signal)
    return message ? projectMessage(this.group, message.raw, message._peers) : null
  }
  preview(messageId: number, signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const ref = this.cache.findMessage(messageId)?.preview
      if (!ref) return null
      const size = 'thumbSize' in ref.location ? ref.location.thumbSize : ''
      return this.images.load(
        `preview:${ref.location._}:${ref.mediaId}:${size}:${ref.size}`,
        async () => {
          try {
            return await downloadPreview(this.client, ref, signal)
          } catch (error) {
            if (!(error instanceof TelegramFileError) || error.category !== 'unavailable') throw error
            const fresh = (await this.refreshMessage(messageId, signal))?.preview
            if (!fresh || fresh.mediaId !== ref.mediaId) return null
            return downloadPreview(this.client, fresh, signal)
          }
        },
        signal,
      )
    })
  }
  avatar(messageId: number, signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const ref = this.cache.findMessage(messageId)?.avatar
      if (!ref) return null
      return this.images.load(
        `avatar:${ref.senderId}:${ref.photoId}:small`,
        async () => {
          try {
            return await downloadAvatar(this.client, ref, signal)
          } catch (error) {
            if (!(error instanceof TelegramFileError) || error.category !== 'unavailable') throw error
            if (messageId < 1) return null
            const fresh = (await this.refreshMessage(messageId, signal))?.avatar
            if (!fresh || fresh.senderId !== ref.senderId || fresh.photoId !== ref.photoId) return null
            return downloadAvatar(this.client, fresh, signal)
          }
        },
        signal,
      )
    })
  }
  dispose() {
    this.lifetime.abort()
    this.ready = false
    this.unsubscribe()
    this.operations.forEach(controller => controller.abort())
    this.operations.clear()
    this.readRequests.clear()
    this.confirmedReads.clear()
    this.cache.dispose()
    return this.startup.then(async () => {
      if (this.group.kind === 'supergroup') await closeChat(this.client, inputPeer(this.group)).catch(() => {})
      await this.client.stopUpdatesLoop().catch(() => {})
    })
  }
}
