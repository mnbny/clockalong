import { IconDownload } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'

import { useTelegramDownload } from '../../services/telegram/chat-queries'
import { chatError } from '../../utils/telegram-chat'

export function TelegramDownloadButton({ messageId }: { messageId: number }) {
  const abort = useRef<AbortController | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const download = useTelegramDownload(() => {
    setStatus('')
    setProgress(null)
  })
  useEffect(() => () => abort.current?.abort(), [])
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        className="btn btn-ghost btn-xs"
        type="button"
        disabled={download.isPending}
        onClick={() => {
          if (abort.current) return
          const controller = new AbortController()
          abort.current = controller
          download.mutate(
            {
              messageId,
              signal: controller.signal,
              onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
            },
            {
              onSuccess: () => setStatus('Saved to Downloads.'),
              onError: error => setStatus(chatError(error)),
              onSettled: () => {
                abort.current = null
              },
            },
          )
        }}>
        <IconDownload className="size-3" />
        {download.isPending ? `Downloading${progress === null ? '…' : ` ${progress}%`}` : 'Download'}
      </button>
      {download.isPending && (
        <button className="btn btn-ghost btn-xs" type="button" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      )}
      {!!status && (
        <span role="status" className="text-base-content/65">
          {status}
        </span>
      )}
    </div>
  )
}
