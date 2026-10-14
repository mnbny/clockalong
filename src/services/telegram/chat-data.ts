import type { FileReference } from './chat-files'
import type { SavedTelegramGroup } from './group'

import { Long, type PeersIndex, type tl } from '@mtcute/web'

export type Conversation = { topicId: number | null }
export type HistoryCursor = { id: number; date: number }
export type TopicCursor = { id: number; date: number; topic: number }
export type TextEntity = {
  kind: string
  offset: number
  length: number
  url?: string
  language?: string
  userId?: string
  documentId?: string
}
export type Sender = {
  id: string
  kind: 'user' | 'chat' | 'channel'
  name: string
  username?: string
  deleted: boolean
  minimal: boolean
  avatarId?: string
}
export type AvatarReference = {
  location: tl.RawInputPeerPhotoFileLocation
  dcId: number
  senderId: string
  photoId: string
}
export type Attachment = {
  kind: string
  id?: string
  name?: string
  mime?: string
  size?: number
  width?: number
  height?: number
  duration?: number
  spoiler: boolean
  downloadable: boolean
}
export type ChatMessage = {
  id: number
  topicId: number | null
  date: number
  editDate?: number
  text: string
  entities: TextEntity[]
  outgoing: boolean
  mentioned: boolean
  protected: boolean
  groupedId?: string
  sender: Sender | null
  replyToId?: number
  replyOutsideGroup: boolean
  service?: string
  attachment: Attachment | null
}
export type MessageRecord = {
  view: ChatMessage
  file?: FileReference
  avatar?: AvatarReference
  preview?: FileReference
}
export type HistoryPage = {
  items: MessageRecord[]
  nextBefore?: HistoryCursor
  serverCount?: number
  countExact?: boolean
}
export type Topic = {
  id: number
  title: string
  date: number
  closed: boolean
  hidden: boolean
  pinned: boolean
  topMessage: number
  readInboxMaxId: number
  readOutboxMaxId: number
  unreadCount: number
  unreadMentionsCount: number
}
export type TopicPage = { items: Topic[]; nextOffset?: TopicCursor; serverCount: number }
export type GroupSummary = {
  title: string
  forum: boolean
  topMessage: number
  readInboxMaxId: number
  readOutboxMaxId: number
  unreadCount: number
  unreadMentionsCount: number
  unreadMark: boolean
  refreshedAt: number
  canSendText: boolean | null
  canSendPhotos: boolean | null
  canSendDocuments: boolean | null
  canSendVideos: boolean | null
  canSendInClosedTopics: boolean
}

export function inputPeer(group: SavedTelegramGroup): tl.TypeInputPeer {
  return group.kind === 'basic'
    ? { _: 'inputPeerChat', chatId: Number(group.id) }
    : { _: 'inputPeerChannel', channelId: Number(group.id), accessHash: Long.fromString(group.accessHash) }
}
export function matchesPeer(group: SavedTelegramGroup, peer: tl.TypePeer) {
  return group.kind === 'basic'
    ? peer._ === 'peerChat' && peer.chatId === Number(group.id)
    : peer._ === 'peerChannel' && peer.channelId === Number(group.id)
}
export function topicFor(group: SavedTelegramGroup, raw: tl.RawMessage | tl.RawMessageService) {
  if (group.kind !== 'supergroup' || !group.forum) return null
  if (raw._ === 'messageService' && raw.action._ === 'messageActionTopicCreate') return raw.id
  const reply = raw.replyTo
  return reply?._ === 'messageReplyHeader' && reply.forumTopic ? (reply.replyToTopId ?? reply.replyToMsgId ?? 1) : 1
}
function entityView(entity: tl.TypeMessageEntity): TextEntity {
  return {
    kind: entity._,
    offset: entity.offset,
    length: entity.length,
    ...('url' in entity ? { url: entity.url } : {}),
    ...('language' in entity ? { language: entity.language } : {}),
    ...('userId' in entity ? { userId: String(entity.userId) } : {}),
    ...('documentId' in entity ? { documentId: String(entity.documentId) } : {}),
  }
}

export function projectMessage(
  group: SavedTelegramGroup,
  raw: tl.TypeMessage,
  peers: PeersIndex,
): MessageRecord | null {
  if (raw._ === 'messageEmpty' || !matchesPeer(group, raw.peerId)) return null
  let avatar: AvatarReference | undefined
  const from = raw.fromId ?? raw.peerId
  const source = peers.has(from) ? peers.get(from) : undefined
  const senderId = String(from._ === 'peerUser' ? from.userId : from._ === 'peerChat' ? from.chatId : from.channelId)
  const kind = from._ === 'peerUser' ? 'user' : from._ === 'peerChat' ? 'chat' : 'channel'
  const sender: Sender = {
    id: senderId,
    kind,
    name:
      source?._ === 'user'
        ? [source.firstName, source.lastName].filter(Boolean).join(' ')
        : source && 'title' in source
          ? source.title
          : '',
    deleted: source?._ === 'user' && !!source.deleted,
    minimal: !source || ('min' in source && !!source.min),
    ...(source && 'username' in source ? { username: source.username } : {}),
  }
  if (
    source &&
    'photo' in source &&
    source.photo &&
    (source.photo._ === 'userProfilePhoto' || source.photo._ === 'chatPhoto')
  ) {
    const photo = source.photo
    let peer: tl.TypeInputPeer | undefined
    if (from._ === 'peerUser')
      peer =
        source._ === 'user' && source.accessHash && !source.min
          ? { _: 'inputPeerUser', userId: from.userId, accessHash: source.accessHash }
          : { _: 'inputPeerUserFromMessage', peer: inputPeer(group), msgId: raw.id, userId: from.userId }
    else if (from._ === 'peerChat') peer = { _: 'inputPeerChat', chatId: from.chatId }
    else if (source._ === 'channel' && source.accessHash && !source.min)
      peer = { _: 'inputPeerChannel', channelId: from.channelId, accessHash: source.accessHash }
    if (peer) {
      sender.avatarId = String(photo.photoId)
      avatar = {
        senderId: `${kind}:${senderId}`,
        photoId: String(photo.photoId),
        dcId: photo.dcId,
        location: { _: 'inputPeerPhotoFileLocation', peer, photoId: photo.photoId, big: false },
      }
    }
  }
  let attachment: Attachment | null = null
  let file: FileReference | undefined
  let preview: FileReference | undefined
  const media = raw._ === 'message' ? raw.media : undefined
  const protectedContent =
    (raw._ === 'message' && !!raw.noforwards) ||
    !peers.has(raw.peerId) ||
    !!(
      peers.has(raw.peerId) &&
      'noforwards' in peers.get(raw.peerId) &&
      (peers.get(raw.peerId) as tl.RawChat | tl.RawChannel).noforwards
    )
  if (media) {
    attachment = { kind: media._, spoiler: 'spoiler' in media && !!media.spoiler, downloadable: false }
    const allowed = !protectedContent && !('ttlSeconds' in media && media.ttlSeconds)
    if (media._ === 'messageMediaPhoto' && media.photo?._ === 'photo') {
      const photo = media.photo
      const sizes = photo.sizes.filter(size => size._ === 'photoSize' || size._ === 'photoSizeProgressive')
      const size = sizes[sizes.length - 1]
      if (size && (size._ === 'photoSize' || size._ === 'photoSizeProgressive')) {
        const bytes = size._ === 'photoSize' ? size.size : Math.max(...size.sizes)
        attachment = {
          ...attachment,
          kind: 'photo',
          id: String(photo.id),
          size: bytes,
          width: size.w,
          height: size.h,
          mime: 'image/jpeg',
          downloadable: allowed,
        }
        if (allowed)
          file = {
            messageId: raw.id,
            mediaId: String(photo.id),
            size: bytes,
            dcId: photo.dcId,
            location: {
              _: 'inputPhotoFileLocation',
              id: photo.id,
              accessHash: photo.accessHash,
              fileReference: photo.fileReference.slice(),
              thumbSize: size.type,
            },
          }
      }
      const thumb = sizes.find(size => size._ === 'photoSize' && size.size <= 512 * 1024)
      if (allowed && thumb?._ === 'photoSize')
        preview = {
          messageId: raw.id,
          mediaId: String(photo.id),
          size: thumb.size,
          dcId: photo.dcId,
          location: {
            _: 'inputPhotoFileLocation',
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference.slice(),
            thumbSize: thumb.type,
          },
        }
    } else if (media._ === 'messageMediaDocument' && media.document?._ === 'document') {
      const document = media.document
      attachment = {
        ...attachment,
        kind: 'document',
        id: String(document.id),
        size: document.size,
        mime: document.mimeType,
        downloadable: allowed,
      }
      for (const attribute of document.attributes) {
        if (attribute._ === 'documentAttributeFilename') attachment.name = attribute.fileName
        if (attribute._ === 'documentAttributeVideo')
          Object.assign(attachment, {
            kind: 'video',
            width: attribute.w,
            height: attribute.h,
            duration: attribute.duration,
          })
        if (attribute._ === 'documentAttributeAudio')
          Object.assign(attachment, { kind: attribute.voice ? 'voice' : 'audio', duration: attribute.duration })
        if (attribute._ === 'documentAttributeImageSize')
          Object.assign(attachment, { width: attribute.w, height: attribute.h })
        if (attribute._ === 'documentAttributeSticker') attachment.kind = 'sticker'
        if (attribute._ === 'documentAttributeAnimated') attachment.kind = 'animation'
      }
      const thumb = document.thumbs?.find(size => size._ === 'photoSize' && size.size <= 512 * 1024)
      if (allowed && thumb?._ === 'photoSize')
        preview = {
          messageId: raw.id,
          mediaId: String(document.id),
          size: thumb.size,
          dcId: document.dcId,
          location: {
            _: 'inputDocumentFileLocation',
            id: document.id,
            accessHash: document.accessHash,
            fileReference: document.fileReference.slice(),
            thumbSize: thumb.type,
          },
        }
      if (allowed)
        file = {
          messageId: raw.id,
          mediaId: String(document.id),
          size: document.size,
          dcId: document.dcId,
          location: {
            _: 'inputDocumentFileLocation',
            id: document.id,
            accessHash: document.accessHash,
            fileReference: document.fileReference.slice(),
            thumbSize: '',
          },
        }
    }
  }
  const reply = raw.replyTo?._ === 'messageReplyHeader' ? raw.replyTo : undefined
  return {
    view: {
      id: raw.id,
      topicId: topicFor(group, raw),
      date: raw.date,
      editDate: raw._ === 'message' ? raw.editDate : undefined,
      text: raw._ === 'message' ? raw.message : '',
      entities: raw._ === 'message' ? (raw.entities ?? []).map(entityView) : [],
      outgoing: !!raw.out,
      mentioned: !!raw.mentioned,
      protected: protectedContent,
      groupedId: raw._ === 'message' && raw.groupedId ? String(raw.groupedId) : undefined,
      sender,
      replyToId: reply?.replyToMsgId,
      replyOutsideGroup: !!reply?.replyToPeerId && !matchesPeer(group, reply.replyToPeerId),
      service: raw._ === 'messageService' ? raw.action._ : undefined,
      attachment,
    },
    file,
    avatar,
    preview,
  }
}
export function projectTopic(topic: tl.RawForumTopic): Topic {
  return {
    id: topic.id,
    title: topic.title,
    date: topic.date,
    closed: !!topic.closed,
    hidden: !!topic.hidden,
    pinned: !!topic.pinned,
    topMessage: topic.topMessage,
    readInboxMaxId: topic.readInboxMaxId,
    readOutboxMaxId: topic.readOutboxMaxId,
    unreadCount: topic.unreadCount,
    unreadMentionsCount: topic.unreadMentionsCount,
  }
}
