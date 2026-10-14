import type { ChatMessage, TextEntity } from '../../../src/services/telegram/chat-data'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import { TelegramMessageText } from '../../../src/components/telegram/TelegramMessageText'
import { messageExcerpt } from '../../../src/utils/telegram-chat'
import { type EntityPart, messageEntityParts, safeTelegramLink } from '../../../src/utils/telegram-message-entities'

const plain = (parts: EntityPart[]): string =>
  parts.map(part => (typeof part === 'string' ? part : plain(part.children))).join('')
const entity = (kind: string, offset: number, length: number): TextEntity => ({
  kind: `messageEntity${kind}`,
  offset,
  length,
})
const render = (text: string, entities: TextEntity[]) =>
  renderToStaticMarkup(createElement(TelegramMessageText, { text, entities }))

test('nested and crossing entities preserve each UTF-16 character exactly once', () => {
  const text = 'A😀bcdefZ'
  const parts = messageEntityParts(text, [entity('Bold', 1, 5), entity('Italic', 3, 5), entity('Underline', 4, 1)])
  expect(plain(parts)).toBe(text)
  const html = render(text, [entity('Bold', 1, 5), entity('Italic', 3, 5)])
  expect(html).toContain('<strong>😀<em>bcd</em></strong><em>ef</em>')
})
test('invalid ranges and surrogate splits cannot hide or corrupt source text', () => {
  const text = '<x>😀 text'
  const malformed = [
    entity('Bold', -1, 8),
    entity('Italic', 4, 1),
    entity('Strike', 0, 999),
    entity('Code', 0.5, 2),
    entity('Unknown', 7, 2),
  ]
  expect(plain(messageEntityParts(text, malformed))).toBe(text)
  const html = render(text, malformed)
  expect(html).toContain('&lt;x&gt;😀 text')
  expect(html).not.toContain('<strong>')
})
test('code and quotes stay single blocks with their inner formatting', () => {
  const html = render('abcdef', [entity('Pre', 0, 6), entity('Bold', 1, 2), entity('Italic', 4, 2)])
  expect(html.match(/<pre /g)).toHaveLength(1)
  expect(html).toContain('a<strong>bc</strong>d<em>ef</em>')
  expect(render('quote', [entity('Blockquote', 0, 5), entity('Bold', 1, 2)])).toContain('<strong>uo</strong>')
})
test('spoilers conceal accessible content and raw HTML stays escaped', () => {
  const html = render('private <script>alert(1)</script>', [entity('Spoiler', 0, 7)])
  expect(html).toContain('Reveal spoiler')
  expect(html).not.toContain('private')
  expect(html).toContain('&lt;script&gt;')
})
test('reply and composer excerpts cannot bypass a message spoiler', () => {
  const message = { text: 'private answer', entities: [entity('Spoiler', 0, 7)] } as ChatMessage
  expect(messageExcerpt(message)).toBe('Spoiler')
  expect(messageExcerpt({ ...message, entities: [] })).toBe('private answer')
})
test('executable, local, credential-bearing, and malformed links stay inert', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///private/file',
    'tg://resolve',
    'https://user:pass@example.com',
    'https://example.com\n',
    'mailto:a@example.com?body=hidden',
  ])
    expect(safeTelegramLink(url)).toBeNull()
  expect(safeTelegramLink('https://example.com/a?b=c')).toBe('https://example.com/a?b=c')
  expect(safeTelegramLink('example.com/path', true)).toBe('https://example.com/path')
  expect(safeTelegramLink('mailto:a@example.com')).toBe('mailto:a@example.com')
  const html = render('click', [{ ...entity('TextUrl', 0, 5), url: 'javascript:alert(1)' }])
  expect(html).not.toContain('<a ')
  expect(html).toContain('click')
})
