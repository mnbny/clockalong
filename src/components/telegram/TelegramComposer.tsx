import { IconPaperclip, IconSend, IconX } from '@tabler/icons-react'
import { useLayoutEffect, useRef } from 'react'

import { useTelegramBlobUrl } from '../../services/telegram/chat-queries'
import { type ChatDraft, fileSize } from '../../utils/telegram-chat'

type Props = {
  draft: ChatDraft
  replyLabel?: string
  disabled: boolean
  canSend: boolean
  error?: string
  notice?: string
  onChange: (draft: ChatDraft) => void
  onFiles: (files: File[]) => void
  onSend: () => void
}

export function TelegramComposer({
  draft,
  replyLabel,
  disabled,
  canSend,
  error,
  notice,
  onChange,
  onFiles,
  onSend,
}: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const compositionEnded = useRef(0)
  const preview = useTelegramBlobUrl(
    draft.attachment?.mime.startsWith('image/') && draft.attachment.mime !== 'image/svg+xml'
      ? draft.attachment.source
      : null,
  )
  useLayoutEffect(() => {
    const input = textarea.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 152)}px`
  }, [draft.text])

  return (
    <div className="border-base-content/10 bg-base-100 shrink-0 space-y-2 border-t p-3">
      {!!draft.replyToId && (
        <div className="border-primary/60 flex items-center gap-2 border-l-2 pl-2 text-xs">
          <span className="min-w-0 flex-1 truncate">Reply to {replyLabel || 'message'}</span>
          <button
            className="btn btn-ghost btn-square btn-xs"
            type="button"
            aria-label="Remove reply"
            disabled={disabled}
            onClick={() => onChange({ ...draft, replyToId: undefined })}>
            <IconX className="size-3" />
          </button>
        </div>
      )}
      {!!draft.attachment && (
        <div className="bg-base-200 flex items-center gap-2 rounded p-2">
          {!!preview && <img className="size-12 rounded object-cover" alt="Selected attachment" src={preview} />}
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate">{draft.attachment.name}</div>
            <div className="text-base-content/60">{fileSize(draft.attachment.source.size)}</div>
          </div>
          {draft.attachment.mediaEligible ? (
            <select
              className="select select-primary select-xs max-w-32"
              value={draft.attachment.mode}
              disabled={disabled}
              aria-label="Attachment format"
              onChange={event =>
                onChange({
                  ...draft,
                  attachment: { ...draft.attachment!, mode: event.target.value as 'media' | 'original' },
                })
              }>
              <option value="media">Send as media</option>
              <option value="original">Send as file</option>
            </select>
          ) : (
            <span className="text-base-content/60 text-xs">Send as file</span>
          )}
          <button
            className="btn btn-ghost btn-square btn-xs"
            type="button"
            aria-label="Remove attachment"
            disabled={disabled}
            onClick={() => onChange({ ...draft, attachment: undefined })}>
            <IconX className="size-4" />
          </button>
        </div>
      )}
      <textarea
        ref={textarea}
        data-autofocus={!disabled ? true : undefined}
        className="textarea textarea-primary w-full resize-none text-sm leading-6"
        rows={2}
        aria-label="Message"
        placeholder="Write a message…"
        value={draft.text}
        disabled={disabled}
        onChange={event => onChange({ ...draft, text: event.target.value })}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
          compositionEnded.current = Date.now()
        }}
        onKeyDown={event => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !composing.current &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229 &&
            Date.now() - compositionEnded.current > 50
          ) {
            event.preventDefault()
            if (canSend) onSend()
          }
        }}
        onPaste={event => {
          const files = [...event.clipboardData.items]
            .filter(item => item.kind === 'file')
            .map(item => item.getAsFile())
            .filter((file): file is File => !!file)
          if (!files.length) return
          event.preventDefault()
          onFiles(files)
        }}
      />
      {!!notice && (
        <p className="text-base-content/60 text-xs" role="status">
          {notice}
        </p>
      )}
      {!!error && (
        <p className="text-error text-xs" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={picker}
          className="hidden"
          type="file"
          onChange={event => {
            onFiles([...(event.target.files ?? [])])
            event.target.value = ''
          }}
        />
        <button
          className="btn btn-ghost btn-square btn-sm"
          type="button"
          aria-label="Attach file"
          disabled={disabled || !!draft.attachment}
          onClick={() => picker.current?.click()}>
          <IconPaperclip className="size-4" />
        </button>
        <span className="text-base-content/50 flex-1 text-xs">Shift+Enter for a new line</span>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={!canSend}
          onClick={() => {
            onSend()
            textarea.current?.focus()
          }}>
          <IconSend className="size-4" />
          Send
        </button>
      </div>
    </div>
  )
}
