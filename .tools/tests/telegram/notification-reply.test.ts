import type { ChatMessage } from '../../../src/services/telegram/chat-data'
import type { TelegramNotification } from '../../../src/services/telegram/notification-store'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, vi } from 'vitest'

import { TelegramNotificationReply } from '../../../src/components/TelegramNotificationReply'
import { queryKeys } from '../../../src/lib/query-client'

vi.mock('../../../src/services/telegram/session-provider', () => ({
  useTelegram: () => ({ chat: null, notifications: { store: { scope: '1:supergroup:123' } } }),
}))

function renderReply(overrides: Partial<ChatMessage>) {
  const message: ChatMessage = {
    id: 1,
    date: 100,
    topicId: 1,
    text: 'Original message',
    entities: [],
    outgoing: false,
    mentioned: false,
    protected: false,
    replyOutsideGroup: false,
    attachment: null,
    sender: { id: '2', kind: 'user', name: 'Other account', deleted: false, minimal: false },
    ...overrides,
  }
  const row: TelegramNotification = {
    scope: '1:supergroup:123',
    id: 2,
    message: { ...message, id: 2, replyToId: 1 },
    collectedAt: 0,
    clearedAt: 0,
    deleted: false,
  }
  const client = new QueryClient()
  client.setQueryData(
    queryKeys.telegram.reply({
      params: { messageId: 1, outsideGroup: false },
      other: [row.scope, row.scope],
    }),
    message,
  )
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(TelegramNotificationReply, { row })),
    )
  } finally {
    client.clear()
  }
}

test('quoted text and attachment names do not reveal spoiler content', () => {
  const text = renderReply({
    text: 'Hidden text',
    entities: [{ kind: 'messageEntitySpoiler', offset: 0, length: 11 }],
  })
  expect(text).toContain('Spoiler')
  expect(text).not.toContain('Hidden text')
  const attachment = renderReply({
    text: '',
    attachment: { kind: 'photo', name: 'Hidden filename', downloadable: true, spoiler: true },
  })
  expect(attachment).toContain('Spoiler')
  expect(attachment).not.toContain('Hidden filename')
})

test('reply excerpts collapse whitespace and truncate long messages', () => {
  const html = renderReply({ text: `Original\n  ${'x'.repeat(200)}` })
  expect(html).toContain('Reply to Other account')
  expect(html).toContain(`Original ${'x'.repeat(151)}…`)
  expect(html).not.toContain('x'.repeat(152))
})
