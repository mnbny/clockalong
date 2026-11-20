import type { UserDtoV1 } from '../clockify/generated/clockify'

import { queryClient, queryKeys } from '../../lib/query-client'
import { getTauriClockifyApiKey } from '../clockify/auth'
import { createClockifyClient } from '../clockify/client'
import { clockifyEntryCache } from '../clockify/entry-cache'

let pending: Promise<unknown> = Promise.resolve()

/** UI starts deliberately replace the real timer; MCP starts choose their mode inside this same queue. */
export function coordinateClockifyTimer<T>(operation: () => Promise<T>) {
  const result = pending.then(operation)
  pending = result.catch(() => {})
  return result
}

export async function getTrackingSession(expectedUserId?: string) {
  const lifecycle = clockifyEntryCache.getLifecycle()
  const userId = queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)?.id
  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    throw new Error('Reconnect the original Clockify account before saving this timer.')
  }
  const { apiKey } = await getTauriClockifyApiKey()
  const assertCurrent = () => {
    if (
      lifecycle !== clockifyEntryCache.getLifecycle() ||
      queryClient.getQueryData<UserDtoV1>(queryKeys.clockify.loggedUser)?.id !== userId
    ) {
      throw new Error('Clockify account changed. The timer has not been saved.')
    }
  }
  assertCurrent()
  if (!apiKey) throw new Error('Clockify is not connected.')
  return { userId, lifecycle, client: createClockifyClient(undefined, { apiKey }), assertCurrent }
}
