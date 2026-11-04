import { useEffect, useState } from 'react'

import { TelegramChatImages } from '../services/telegram/chat-images'

export function useCachedTelegramImage(scope: string, key: string | undefined) {
  const [image, setImage] = useState<{ scope: string; key: string; blob: Blob }>()
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    void new TelegramChatImages(scope)
      .read(key, controller.signal)
      .then(blob => {
        if (blob && !controller.signal.aborted) setImage({ scope, key, blob })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [scope, key])
  return image?.scope === scope && image.key === key ? image.blob : undefined
}
