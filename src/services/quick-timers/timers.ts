import { formatTemplate, parseTemplateTokens } from '../../utils/templates'
import { type CreateTimeEntryRequest } from '../clockify/generated/clockify'
import { createClockifyTimeEntry } from '../clockify/time-entries'
import { type ClockifyTimeEntryInterval, getClockifyTimeEntryTiming } from '../clockify/time-entry-interval'
import {
  type ClockifyProject,
  type QuickTimerPreset,
  type QuickTimersActiveEntry,
  type QuickTimersCacheEntry,
  storage,
} from '../storage/config'

type QuickTimerValues = Record<string, string>

type QuickTimerCacheEntry = QuickTimersCacheEntry & Record<string, unknown>

export function getQuickTimerTimeEntryBody({
  interval,
  billable,
  preset,
  project,
  values,
}: {
  interval?: ClockifyTimeEntryInterval
  billable: boolean
  preset: QuickTimerPreset
  project: ClockifyProject
  values: QuickTimerValues
}) {
  const templateTokens = parseTemplateTokens(preset.descriptionTemplate)
  const body = {
    billable,
    description: formatTemplate(preset.descriptionTemplate, values, {
      fallback: '',
      knownTokens: templateTokens,
    }),
    projectId: project.projectId,
    ...getClockifyTimeEntryTiming(interval),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest

  return body
}

export async function persistQuickTimerValues({
  preset,
  values,
}: {
  preset: QuickTimerPreset
  values: QuickTimerValues
}) {
  const templateTokens = parseTemplateTokens(preset.descriptionTemplate)

  await storage.set('quickTimersCache', current => [
    ...current.filter(entry => entry.id !== preset.id),
    {
      id: preset.id,
      values: Object.fromEntries(templateTokens.map(token => [token, values[token] ?? ''])),
    },
  ])
}

export async function persistQuickTimerActiveEntry({ entryId, quickTimerId }: Exclude<QuickTimersActiveEntry, null>) {
  await storage.set('quickTimersActiveEntry', { entryId, quickTimerId })
}

export function resolveQuickTimerValues({
  cache,
  preset,
  values = {},
}: {
  cache: QuickTimerCacheEntry[]
  preset: QuickTimerPreset
  values?: QuickTimerValues
}) {
  const cachedValues = cache.find(entry => entry.id === preset.id)

  return Object.fromEntries(
    parseTemplateTokens(preset.descriptionTemplate).map(token => [
      token,
      values[token] ?? getQuickTimerCachedValue(cachedValues, token),
    ]),
  ) as QuickTimerValues
}

function getQuickTimerCachedValue(cachedValues: QuickTimerCacheEntry | undefined, token: string) {
  const value = cachedValues?.values?.[token] ?? cachedValues?.[token]
  return typeof value === 'string' ? value : ''
}

export function createQuickTimerTimeEntry(input: Parameters<typeof getQuickTimerTimeEntryBody>[0]) {
  return createClockifyTimeEntry(getQuickTimerTimeEntryBody(input), input.project.workspaceId)
}
