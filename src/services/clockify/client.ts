import { type ZodiosOptions } from '@zodios/core'
import axios, { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from 'axios'

import { parseInternalRefs } from '../../utils/templates'
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

  axiosInstance.interceptors.response.use(
    response => {
      clockifyApiLog('response', getClockifyResponseLog(response))
      return response
    },
    error => {
      if (axios.isAxiosError(error)) {
        clockifyApiLog('response error', {
          baseURL: error.config?.baseURL,
          data: getClockifyResponseDataLog(error.response?.data),
          method: error.config?.method?.toUpperCase(),
          params: error.config?.params,
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
        })
      }

      return Promise.reject(error)
    },
  )
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

function getClockifyResponseLog(response: AxiosResponse) {
  return {
    baseURL: response.config.baseURL,
    data: getClockifyResponseDataLog(response.data),
    method: response.config.method?.toUpperCase(),
    params: response.config.params,
    status: response.status,
    statusText: response.statusText,
    url: response.config.url,
  }
}

function getClockifyResponseDataLog(data: unknown): unknown {
  if (Array.isArray(data)) {
    return {
      count: data.length,
      refCounts: getClockifyEntryRefCounts(data),
      sample: data.slice(0, 5).map(getClockifyEntryResponseLog),
      type: 'array',
    }
  }

  if (!data || typeof data !== 'object') {
    return data
  }

  if (isClockifyTimeEntryLike(data)) {
    return getClockifyEntryResponseLog(data)
  }

  return {
    keys: Object.keys(data).slice(0, 20),
    type: 'object',
  }
}

function getClockifyEntryResponseLog(entry: unknown) {
  if (!entry || typeof entry !== 'object') {
    return entry
  }

  const record = entry as Record<string, unknown>
  const timeInterval = getRecordValue(record, 'timeInterval')
  const timeIntervalRecord =
    timeInterval && typeof timeInterval === 'object' ? (timeInterval as Record<string, unknown>) : {}
  const description = getRecordValue(record, 'description')
  const refs = parseInternalRefs(typeof description === 'string' ? description : undefined)

  return {
    description: truncateLogText(typeof description === 'string' ? description : undefined),
    hasEnd: Boolean(timeIntervalRecord.end),
    id: getRecordValue(record, 'id'),
    internalRefs: refs.map(ref => ref.provider),
    start: timeIntervalRecord.start,
    end: timeIntervalRecord.end,
    userId: getRecordValue(record, 'userId'),
    workspaceId: getRecordValue(record, 'workspaceId'),
  }
}

function getClockifyEntryRefCounts(entries: unknown[]) {
  let github = 0
  let linear = 0

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const description = getRecordValue(entry, 'description')
    const refs = parseInternalRefs(typeof description === 'string' ? description : undefined)

    if (refs.some(ref => ref.provider === 'github')) {
      github += 1
    }

    if (refs.some(ref => ref.provider === 'linear')) {
      linear += 1
    }
  }

  return { github, linear }
}

function isClockifyTimeEntryLike(data: object) {
  return Boolean(getRecordValue(data, 'id') && getRecordValue(data, 'timeInterval'))
}

function truncateLogText(value: string | undefined, maxLength = 180) {
  if (!value) {
    return value
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
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
