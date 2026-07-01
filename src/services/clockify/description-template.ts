import { formatTemplate, getUnknownTemplateTokens } from '../../utils/templates'

export const defaultClockifyDescriptionTemplate = '{identifier}: {title}'
export const defaultClockifyDescriptionTemplateFallback = 'n/a'

export type ClockifyDescriptionTemplateToken =
  | 'identifier'
  | 'title'
  | 'number'
  | 'url'
  | 'teamKey'
  | 'stateName'
  | 'assigneeName'

export type ClockifyDescriptionTemplateValues = Partial<
  Record<ClockifyDescriptionTemplateToken, string | number | null | undefined>
>

export type FormatClockifyDescriptionTemplateOptions = {
  fallback?: string
}

export type ClockifyDescriptionTemplateTokenGroup = {
  label: string
  tokens: ClockifyDescriptionTemplateToken[]
}

export const clockifyDescriptionTemplateTokenGroups = [
  {
    label: 'Issue',
    tokens: ['identifier', 'title', 'number', 'url'],
  },
  {
    label: 'Details',
    tokens: ['teamKey', 'stateName', 'assigneeName'],
  },
] satisfies ClockifyDescriptionTemplateTokenGroup[]

export const clockifyDescriptionTemplateTokens = clockifyDescriptionTemplateTokenGroups.flatMap(group => group.tokens)

export const sampleClockifyDescriptionTemplateValues = {
  assigneeName: 'Alex Chen',
  identifier: 'ENG-123',
  number: 123,
  stateName: 'In Progress',
  teamKey: 'ENG',
  title: 'Fix settings drawer log refresh',
  url: 'https://linear.app/example/issue/ENG-123/fix-settings-drawer-log-refresh',
} satisfies ClockifyDescriptionTemplateValues

export function formatClockifyDescriptionTemplate(
  template: string,
  values: ClockifyDescriptionTemplateValues,
  { fallback = defaultClockifyDescriptionTemplateFallback }: FormatClockifyDescriptionTemplateOptions = {},
) {
  return formatTemplate(template, values, { fallback, knownTokens: clockifyDescriptionTemplateTokens })
}

export function getUnknownClockifyDescriptionTemplateTokens(template: string) {
  return getUnknownTemplateTokens(template, clockifyDescriptionTemplateTokens)
}
