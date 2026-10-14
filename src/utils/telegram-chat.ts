import type { Attachment, ChatMessage, GroupSummary, Topic, TopicPage } from '../services/telegram/chat-data'
import type { AttachmentInput } from '../services/telegram/chat-files'

import { TelegramChatError } from '../services/telegram/chat'
import { TelegramFileError } from '../services/telegram/chat-files'

export type ChatDraft = { text: string; replyToId?: number; attachment?: AttachmentInput & { mediaEligible?: boolean } }
export const emptyDraft: ChatDraft = { text: '' }

export function chatUnreadCount(
  forum: boolean,
  summary: Pick<GroupSummary, 'unreadCount'> | undefined,
  pages: TopicPage[] | undefined,
) {
  if (!forum) return summary?.unreadCount
  if (!pages?.length || pages[pages.length - 1].nextOffset) return undefined
  const topics = new Map<number, Topic>()
  for (const page of pages) for (const topic of page.items) if (!topics.has(topic.id)) topics.set(topic.id, topic)
  return [...topics.values()].reduce((count, topic) => count + (topic.hidden ? 0 : topic.unreadCount), 0)
}

export function chatError(error: unknown) {
  if (error instanceof TelegramFileError) return error.message
  if (error instanceof TelegramChatError) {
    switch (error.category) {
      case 'unknown-send':
        return 'Could not confirm delivery.'
      case 'aborted':
        return 'Send cancelled.'
      case 'restricted':
        return 'Telegram does not allow this action here.'
      case 'unavailable':
        return 'Telegram is unavailable. Reconnect in Settings.'
      case 'invalid-input':
        return 'Telegram could not accept this message or file.'
      case 'wait':
        return error.waitSeconds ? `Try again in ${error.waitSeconds} seconds.` : 'Please wait before trying again.'
    }
  }
  return 'Could not reach Telegram. Try again.'
}

export function senderName(message: ChatMessage) {
  return message.sender?.deleted
    ? 'Deleted account'
    : message.sender?.name || message.sender?.username || 'Unknown sender'
}
export function messageExcerpt(message: ChatMessage) {
  if (message.entities.some(entity => entity.kind === 'messageEntitySpoiler')) return 'Spoiler'
  return message.text || (message.attachment ? attachmentLabel(message.attachment) : 'Message')
}
export function attachmentLabel(attachment: Attachment) {
  if (attachment.name) return attachment.name
  const labels: Record<string, string> = {
    photo: 'Photo',
    video: 'Video',
    document: 'File',
    animation: 'Animation',
    sticker: 'Sticker',
    audio: 'Audio',
    voice: 'Voice message',
    messageMediaPoll: 'Poll',
    messageMediaContact: 'Contact',
    messageMediaGeo: 'Location',
    messageMediaWebPage: 'Link preview',
  }
  return labels[attachment.kind] ?? 'Attachment'
}
export function fileSize(size?: number) {
  if (size === undefined) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}
export function mediaType(attachment: Attachment) {
  if (!attachment.downloadable) return null
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(attachment.mime ?? ''))
    return 'image'
  if (['video/mp4', 'video/webm', 'video/quicktime'].includes(attachment.mime ?? '')) return 'video'
  return null
}
