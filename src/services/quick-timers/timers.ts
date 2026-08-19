import { formatTemplate, parseTemplateTokens } from '../../utils/templates'
import { clockify } from '../clockify/client'
import { type CreateTimeEntryRequest, type TimeEntryDtoImplV1 } from '../clockify/generated/clockify'
import {
  type ClockifyProject,
  type QuickTimerPreset,
  type QuickTimersActiveEntry,
  type QuickTimersCacheEntry,
  storage,
} from '../storage/config'

type QuickTimerValues = Record<string, string>

type QuickTimerCacheEntry = QuickTimersCacheEntry & Record<string, unknown>

export async function createQuickTimerTimeEntry({
  billable,
  preset,
  project,
  values,
}: {
  billable: boolean
  preset: QuickTimerPreset
  project: ClockifyProject
  values: QuickTimerValues
}): Promise<TimeEntryDtoImplV1> {
  const templateTokens = parseTemplateTokens(preset.descriptionTemplate)
  const body = {
    billable,
    description: formatTemplate(preset.descriptionTemplate, values, {
      fallback: '',
      knownTokens: templateTokens,
    }),
    projectId: project.projectId,
    start: new Date().toISOString(),
    type: 'REGULAR',
  } satisfies CreateTimeEntryRequest

  return clockify.createTimeEntry(body, { params: { workspaceId: project.workspaceId } })
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
