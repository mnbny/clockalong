import { type ZodiosOptions } from '@zodios/core'
import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios'

import { getTauriClockifyApiKey } from './auth'
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

const authenticatedClockifyAxios = axios.create(clockifyClientOptions.axiosConfig)

authenticatedClockifyAxios.interceptors.request.use(async config => {
  const { clockifyApiKey } = await getTauriClockifyApiKey()

  if (!clockifyApiKey) {
    throw new Error('Missing Clockify API key.')
  }

  const headers = AxiosHeaders.from(config.headers)
  headers.set('X-Api-Key', clockifyApiKey)

  config.headers = headers
  return config
})

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

export const clockify = createClockifyClient(CLOCKIFY_GLOBAL_API_BASE_URL, {
  axiosInstance: authenticatedClockifyAxios,
})

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
