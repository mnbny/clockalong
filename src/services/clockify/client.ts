import { type ZodiosOptions } from '@zodios/core'
import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios'

import { getTauriClockifyApiKey } from './auth'
import { createApiClient } from './generated/clockify'
import { createApiClient as createReportsApiClient } from './generated/reports'

export const CLOCKIFY_GLOBAL_API_BASE_URL = 'https://api.clockify.me/api'
export const CLOCKIFY_GLOBAL_REPORTS_BASE_URL = 'https://reports.api.clockify.me'

export type CreateClockifyClientOptions = ZodiosOptions & {
  apiKey?: string
}

export const clockifyClientOptions = {
  axiosConfig: {
    paramsSerializer: {
      indexes: null,
    },
  },
  validate: 'request',
} satisfies ZodiosOptions

const authenticatedClockifyAxios = axios.create(clockifyClientOptions.axiosConfig)
const authenticatedClockifyReportsAxios = axios.create(clockifyClientOptions.axiosConfig)

;[authenticatedClockifyAxios, authenticatedClockifyReportsAxios].forEach(axiosInstance => {
  axiosInstance.interceptors.request.use(async config => {
    clockifyApiLog('request', {
      baseURL: config.baseURL,
      data: getClockifyRequestBodyLog(config.data),
      method: config.method?.toUpperCase(),
      params: config.params,
      url: config.url,
    })

    const { apiKey } = await getTauriClockifyApiKey()

    if (!apiKey) {
      throw new Error('Missing Clockify API key.')
    }

    const headers = AxiosHeaders.from(config.headers)
    headers.set('X-Api-Key', apiKey)

    config.headers = headers
    return config
  })
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

export function createClockifyReportsClient(
  baseUrl = CLOCKIFY_GLOBAL_REPORTS_BASE_URL,
  { apiKey, ...options }: CreateClockifyClientOptions = {},
) {
  const axiosConfig = createClockifyAxiosConfig(apiKey, options.axiosConfig)

  const axiosInstance =
    options.axiosInstance ??
    axios.create({
      ...clockifyClientOptions.axiosConfig,
      ...axiosConfig,
    })

  return createReportsApiClient(baseUrl, {
    ...clockifyClientOptions,
    ...options,
    axiosConfig,
    axiosInstance,
  })
}

export const clockify = createClockifyClient(CLOCKIFY_GLOBAL_API_BASE_URL, {
  axiosInstance: authenticatedClockifyAxios,
})

export const clockifyReports = createClockifyReportsClient(CLOCKIFY_GLOBAL_REPORTS_BASE_URL, {
  axiosInstance: authenticatedClockifyReportsAxios,
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

function getClockifyRequestBodyLog(data: unknown) {
  const body = parseClockifyRequestBody(data)

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body
  }

  return {
    amountShown: getRecordValue(body, 'amountShown'),
    amounts: getRecordValue(body, 'amounts'),
    dateRangeEnd: getRecordValue(body, 'dateRangeEnd'),
    dateRangeStart: getRecordValue(body, 'dateRangeStart'),
    dateRangeType: getRecordValue(body, 'dateRangeType'),
    exportType: getRecordValue(body, 'exportType'),
    summaryGroups: getNestedRecordValue(body, 'summaryFilter', 'groups'),
    userCount: getNestedArrayLength(body, 'users', 'ids'),
    weekStart: getRecordValue(body, 'weekStart'),
  }
}

function parseClockifyRequestBody(data: unknown) {
  if (typeof data !== 'string') {
    return data
  }

  try {
    return JSON.parse(data)
  } catch {
    return '[non-json body]'
  }
}

function getRecordValue(record: object, key: string) {
  return (record as Record<string, unknown>)[key]
}

function getNestedRecordValue(record: object, key: string, nestedKey: string) {
  const nested = getRecordValue(record, key)

  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return undefined
  }

  return getRecordValue(nested, nestedKey)
}

function getNestedArrayLength(record: object, key: string, nestedKey: string) {
  const value = getNestedRecordValue(record, key, nestedKey)
  return Array.isArray(value) ? value.length : undefined
}

function clockifyApiLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[clockify api] ${message}`)
    return
  }

  console.info(`[clockify api] ${message}`, details)
}
