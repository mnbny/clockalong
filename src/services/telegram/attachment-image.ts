import type { Attachment } from './chat-data'

export const maxTelegramImageBytes = 20 * 1024 * 1024
export const telegramImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function isImageAttachment(attachment: Attachment | null) {
  return !!(
    attachment?.downloadable &&
    attachment.id &&
    (attachment.kind === 'photo' ||
      (attachment.kind === 'document' && telegramImageMimeTypes.includes(attachment.mime ?? ''))) &&
    attachment.size &&
    attachment.size <= maxTelegramImageBytes
  )
}
