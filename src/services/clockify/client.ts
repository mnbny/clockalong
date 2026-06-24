import { type ZodiosOptions } from '@zodios/core'
import axios, { type AxiosRequestConfig } from 'axios'

import { createApiClient } from './generated/clockify'

export const CLOCKIFY_GLOBAL_API_BASE_URL = 'https://api.clockify.me/api'

export type CreateClockifyClientOptions = ZodiosOptions & {
  apiKey?: string
}

export const clockifyClientOptions = {
  axiosConfig: {
    paramsSerializer: {
      indexes: null,
    },
  },
} satisfies ZodiosOptions

export function createClockifyClient(
  baseUrl = CLOCKIFY_GLOBAL_API_BASE_URL,
  { apiKey, ...options }: CreateClockifyClientOptions = {},
) {
  const axiosConfig = createClockifyAxiosConfig(apiKey, options.axiosConfig)

  const axiosInstance =
    options.axiosInstance ??
    axios.create({
      ...clockifyClientOptions.axiosConfig,
      ...axiosConfig,
    })

  return createApiClient(baseUrl, {
    ...clockifyClientOptions,
    ...options,
    axiosConfig,
    axiosInstance,
  })
}

export const clockify = createClockifyClient()

function createClockifyAxiosConfig(apiKey: string | undefined, axiosConfig: AxiosRequestConfig | undefined) {
  const mergedConfig = {
    ...clockifyClientOptions.axiosConfig,
    ...axiosConfig,
  } satisfies AxiosRequestConfig

  if (!apiKey) {
    return mergedConfig
  }

  return {
    ...mergedConfig,
    headers: {
      ...(axiosConfig?.headers as Record<string, string> | undefined),
      'X-Api-Key': apiKey,
    },
  } satisfies AxiosRequestConfig
}
