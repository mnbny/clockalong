import { LinearClient } from '@linear/sdk'

import { getTauriLinearAccessToken } from './auth'

export type CreateLinearClientOptions = {
  accessToken?: string
}

export async function createLinearClient({ accessToken }: CreateLinearClientOptions = {}) {
  const resolvedAccessToken = accessToken ?? (await getLinearAccessToken())

  if (!resolvedAccessToken) {
    throw new Error('Missing Linear access token.')
  }

  return new LinearClient({ accessToken: resolvedAccessToken })
}

async function getLinearAccessToken() {
  const { linearAccessToken } = await getTauriLinearAccessToken()
  return linearAccessToken
}
