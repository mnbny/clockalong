import { expect, test } from 'vitest'

import { telegramNotificationLink } from '../../../src/services/telegram/notification-link'

test.each([null, 1, 42])('opens the message with its topic context (%s)', topicId => {
  const url = telegramNotificationLink({
    scope: '55:supergroup:1234567890',
    message: { id: 98, topicId },
  })
  expect(url).toBe(`tg://privatepost?channel=1234567890&post=98${topicId === null ? '' : `&thread=${topicId}`}`)
})

test.each(['55:basic:123', '55:supergroup:123&post=9', 'invalid'])('does not link unsupported scopes (%s)', scope => {
  expect(
    telegramNotificationLink({
      scope,
      message: { id: 98, topicId: null },
    }),
  ).toBeNull()
})
