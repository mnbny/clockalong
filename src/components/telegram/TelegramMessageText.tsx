import type { TextEntity } from '../../services/telegram/chat-data'
import type { ReactNode } from 'react'

import { openUrl } from '@tauri-apps/plugin-opener'
import { Fragment, useMemo, useState } from 'react'

import { type EntityPart, messageEntityParts, safeTelegramLink } from '../../utils/telegram-message-entities'

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  return revealed ? (
    <span>{children}</span>
  ) : (
    <button
      type="button"
      className="bg-base-content/20 rounded px-2 text-xs"
      onClick={() => setRevealed(true)}
      aria-label="Reveal spoiler">
      Spoiler
    </button>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <a
        className="link link-primary break-all"
        href={href}
        title={href}
        rel="noreferrer"
        onClick={event => {
          event.preventDefault()
          void openUrl(href).catch(() => setFailed(true))
        }}>
        {children}
      </a>
      {failed && <span className="text-error text-xs"> Could not open link.</span>}
    </>
  )
}

export function TelegramMessageText({ text, entities }: { text: string; entities: TextEntity[] }) {
  const parts = useMemo(() => messageEntityParts(text, entities), [text, entities])
  const render = (parts: EntityPart[]): ReactNode =>
    parts.map((part, index) => {
      if (typeof part === 'string') return part
      const { entity } = part
      const children = render(part.children)
      let content: ReactNode = children
      switch (entity.kind) {
        case 'messageEntityBold':
          content = <strong>{children}</strong>
          break
        case 'messageEntityItalic':
          content = <em>{children}</em>
          break
        case 'messageEntityUnderline':
          content = <u>{children}</u>
          break
        case 'messageEntityStrike':
          content = <s>{children}</s>
          break
        case 'messageEntityCode':
          content = <code className="bg-base-200 rounded px-1 font-mono text-xs">{children}</code>
          break
        case 'messageEntityPre':
          content = (
            <pre
              className="bg-base-200 my-1 max-w-full overflow-x-auto rounded p-2 font-mono text-xs whitespace-pre"
              aria-label={entity.language ? `Code (${entity.language})` : 'Code'}>
              <code>{children}</code>
            </pre>
          )
          break
        case 'messageEntityBlockquote':
          content = (
            <blockquote className="border-primary/60 text-base-content/75 my-1 border-l-2 pl-3">{children}</blockquote>
          )
          break
        case 'messageEntitySpoiler':
          content = <Spoiler>{children}</Spoiler>
          break
        case 'messageEntityUrl':
        case 'messageEntityTextUrl':
        case 'messageEntityEmail': {
          const value = text.slice(entity.offset, entity.offset + entity.length)
          const href = safeTelegramLink(
            entity.kind === 'messageEntityEmail' ? `mailto:${value}` : (entity.url ?? value),
            entity.kind === 'messageEntityUrl',
          )
          if (href) content = <ExternalLink href={href}>{children}</ExternalLink>
          break
        }
      }
      return <Fragment key={index}>{content}</Fragment>
    })
  return (
    <div className="min-w-0 text-sm leading-6 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
      {render(parts)}
    </div>
  )
}
