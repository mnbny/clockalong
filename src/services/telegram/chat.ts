import type { QueryClient } from '@tanstack/react-query'

import { type BaseTelegramClient, Long, PeersIndex, tl } from '@mtcute/web'
import { closeChat, getMessages, openChat, sendMedia, sendText } from '@mtcute/web/methods.js'

import { isImageAttachment } from './attachment-image'
import { TelegramChatCache } from './chat-cache'
import {
  type AvatarReference,
  type ChatMessage,
  type Conversation,
  type HistoryCursor,
  type HistoryPage,
  inputPeer,
  matchesPeer,
  type MessageRecord,
  type NotificationHistoryPage,
  projectMessage,
  projectTopic,
  type TelegramMessageEvent,
  type TopicCursor,
  type TopicPage,
} from './chat-data'
import {
  type AttachmentInput,
  downloadAvatar,
  downloadImage,
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
export type SendInput = Conversation & { text: string }
export type SendOperation = Readonly<SendInput & { id: string; scope: string; attachment?: AttachmentInput }>

export class TelegramChat {
  readonly scope: string
  readonly forum: boolean
  connection: 'offline' | 'connecting' | 'updating' | 'connected' = 'connected'
  readonly lifetime = new AbortController()
  readonly cache: TelegramChatCache
  private unsubscribe = () => {}
  private issued = new WeakSet<SendOperation>()
  private ready = true
  // Only IDs are retained while sending, including acknowledgements that precede the message body.
  private operations = new Map<string, number | undefined>()
  private startup: Promise<void> = Promise.resolve()
  private readonly images: TelegramChatImages
  private messageListeners = new Set<(event: TelegramMessageEvent) => void>()
  private notificationRecords = new Map<number, { record: MessageRecord; expiresAt: number }>()

  get notificationScope() {
    return `${this.group.accountId}:${this.group.kind}:${this.group.id}`
  }
  get accountId() {
    return this.group.accountId
  }
  subscribeMessages(listener: (event: TelegramMessageEvent) => void) {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }
  private emitMessage(event: TelegramMessageEvent) {
    if (event.type === 'message') this.rememberNotificationRecords([event.record])
    else if (event.type === 'deleted') event.ids.forEach(id => this.notificationRecords.delete(id))
    else this.notificationRecords.clear()
    for (const listener of this.messageListeners) listener(event)
  }

  private rememberNotificationRecords(records: MessageRecord[]) {
    if (!this.isReady) return records
    for (const record of records) {
      const existing = this.notificationRecords.get(record.view.id)
      if (existing && (existing.record.view.editDate ?? 0) > (record.view.editDate ?? 0)) continue
      this.notificationRecords.delete(record.view.id)
      this.notificationRecords.set(record.view.id, { record, expiresAt: Date.now() + 5 * 60_000 })
    }
    while (this.notificationRecords.size > 256)
      this.notificationRecords.delete(this.notificationRecords.keys().next().value!)
    return records
  }

  private async notificationRecord(id: number, signal: AbortSignal, refresh = false) {
    const cached = this.notificationRecords.get(id)
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.record
    this.notificationRecords.delete(id)
    const records = await this.fetchNotificationMessages([id], signal)
    return records[0]
  }

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
      this.operations,
      () => this.isReady,
      () => this.refreshAccess(),
      state => {
        this.connection = state
        this.onChange()
      },
      event => this.emitMessage(event),
    )
    this.startup = (async () => {
      await this.client.startUpdatesLoop()
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
    if (this.group.kind === 'supergroup' && Number(this.group.id) === id) {
      void this.cache.recover()
      this.emitMessage({ type: 'recover' })
    }
  }
  // Unlike a topic conversation, this scan covers the entire selected group.
  fetchNotificationHistory(before: HistoryCursor | null, signal?: AbortSignal): Promise<NotificationHistoryPage> {
    return this.run(signal, async signal => {
      const response = await this.client.call(
        {
          _: 'messages.getHistory',
          peer: inputPeer(this.group),
          offsetId: before?.id ?? 0,
          offsetDate: before?.date ?? 0,
          addOffset: 0,
          limit: 50,
          maxId: 0,
          minId: 0,
          hash: Long.ZERO,
        },
        { abortSignal: signal },
      )
      if (response._ === 'messages.messagesNotModified') throw new TelegramChatError('network')
      const peers = PeersIndex.from(response)
      const last = response.messages[response.messages.length - 1]
      return {
        items: this.rememberNotificationRecords(
          response.messages
            .map(raw => projectMessage(this.group, raw, peers))
            .filter((record): record is MessageRecord => !!record),
        ),
        newestId: Math.max(0, ...response.messages.map(raw => raw.id)),
        nextBefore: last ? { id: last.id, date: last._ === 'messageEmpty' ? 0 : last.date } : undefined,
      }
    })
  }
  fetchNotificationMessages(ids: number[], signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const messages = await getMessages(this.client, inputPeer(this.group), ids)
      this.check(signal)
      return this.rememberNotificationRecords(
        messages
          .map(message => (message ? projectMessage(this.group, message.raw, message._peers) : null))
          .filter((record): record is MessageRecord => !!record),
      )
    })
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
  createSend(input: SendInput, attachment?: AttachmentInput): SendOperation {
    this.check()
    this.conversation(input)
    const random = crypto.getRandomValues(new Uint32Array(2))
    const id = Long.fromBits(random[0], random[1]).toString()
    const operation = Object.freeze({
      ...input,
      attachment: attachment
        ? Object.freeze({ ...attachment, video: attachment.video ? Object.freeze({ ...attachment.video }) : undefined })
        : undefined,
      scope: this.scope,
      id: id === '0' ? '1' : id,
    })
    this.issued.add(operation)
    return operation
  }
  async send(operation: SendOperation, options: { signal?: AbortSignal } = {}) {
    if (!this.issued.has(operation) || operation.scope !== this.scope || this.operations.has(operation.id))
      throw new TelegramChatError('invalid-input')
    this.check()
    if (this.connection === 'offline' || this.connection === 'connecting') throw new TelegramChatError('unavailable')
    this.conversation(operation)
    if (
      operation.topicId &&
      this.cache.topic(operation.topicId)?.closed &&
      !this.cache.summary()?.canSendInClosedTopics
    )
      throw new TelegramChatError('restricted')
    if (!operation.attachment && this.cache.summary()?.canSendText === false) throw new TelegramChatError('restricted')
    this.operations.set(operation.id, undefined)
    try {
      const record = await this.run(
        options.signal,
        async signal => {
          const params = {
            randomId: Long.fromString(operation.id),
            abortSignal: signal,
            replyTo: operation.topicId && operation.topicId !== 1 ? operation.topicId : undefined,
          }
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
                  caption: operation.text,
                  progressCallback: (done, total) => {
                    if (done >= total) finalStarted = true
                  },
                })
              : await sendText(this.client, inputPeer(this.group), operation.text, params)
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
      await this.cache.upsert(record, { confirmedSend: true })
      return record
    } finally {
      this.operations.delete(operation.id)
    }
  }
  private async refreshMessage(messageId: number, signal: AbortSignal) {
    if (!this.cache.findMessage(messageId)) throw new TelegramChatError('unavailable')
    const [message] = await getMessages(this.client, inputPeer(this.group), [messageId])
    this.check(signal)
    return message ? projectMessage(this.group, message.raw, message._peers) : null
  }
  notificationImage(
    message: Pick<ChatMessage, 'id' | 'attachment' | 'protected'>,
    full: boolean,
    signal?: AbortSignal,
  ) {
    return this.run(signal, async signal => {
      if (message.protected || !isImageAttachment(message.attachment)) return null
      const mediaId = message.attachment!.id!
      const download = async () => {
        const read = async (refresh = false) => {
          const record = await this.notificationRecord(message.id, signal, refresh)
          if (!record || record.view.protected || !isImageAttachment(record.view.attachment)) return null
          if (record.view.attachment?.id !== mediaId || record.view.attachment.kind !== message.attachment?.kind)
            return null
          return (full ? record.image : record.preview) ?? null
        }
        const ref = await read()
        if (!ref) return null
        const fetch = full ? downloadImage : downloadPreview
        try {
          return await fetch(this.client, ref, signal)
        } catch (error) {
          if (!(error instanceof TelegramFileError) || error.category !== 'unavailable') throw error
          const fresh = await read(true)
          return fresh ? fetch(this.client, fresh, signal) : null
        }
      }
      return this.images.load(
        `${full ? 'notification-image' : 'notification-preview'}:${message.attachment!.kind}:${mediaId}`,
        download,
        signal,
      )
    })
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
  avatar(message: Pick<ChatMessage, 'id' | 'sender'>, signal?: AbortSignal) {
    return this.run(signal, async signal => {
      const sender = message.sender
      if (!sender?.avatarId) return null
      const senderId = `${sender.kind}:${sender.id}`
      const matches = (ref: AvatarReference | undefined): ref is AvatarReference =>
        !!ref && ref.senderId === senderId && ref.photoId === sender.avatarId
      const refresh = async (force = false) => (await this.notificationRecord(message.id, signal, force))?.avatar
      return this.images.load(
        `avatar:${senderId}:${sender.avatarId}:small`,
        async () => {
          let ref = this.cache.findMessage(message.id)?.avatar
          if (!matches(ref)) ref = await refresh()
          if (!matches(ref)) return null
          try {
            return await downloadAvatar(this.client, ref, signal)
          } catch (error) {
            if (!(error instanceof TelegramFileError) || error.category !== 'unavailable') throw error
            const fresh = await refresh(true)
            if (!matches(fresh)) return null
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
    this.operations.clear()
    this.messageListeners.clear()
    this.notificationRecords.clear()
    this.cache.dispose()
    return this.startup.then(async () => {
      if (this.group.kind === 'supergroup') await closeChat(this.client, inputPeer(this.group)).catch(() => {})
      await this.client.stopUpdatesLoop().catch(() => {})
    })
  }
}
