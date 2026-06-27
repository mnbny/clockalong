import { formatTemplate, getUnknownTemplateTokens } from '../../utils/templates'

export const defaultClockifyDescriptionTemplate = '{identifier}: {title}'
export const defaultClockifyDescriptionTemplateFallback = 'n/a'

export type ClockifyDescriptionTemplateToken =
  | 'identifier'
  | 'title'
  | 'number'
  | 'url'
  | 'priorityLabel'
  | 'estimate'
  | 'dueDate'
  | 'teamKey'
  | 'teamName'
  | 'stateName'
  | 'assigneeName'
  | 'creatorName'
  | 'projectName'
  | 'cycleName'
  | 'cycleNumber'
  | 'milestoneName'
  | 'labels'

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
    label: 'Team & status',
    tokens: ['teamKey', 'teamName', 'stateName', 'priorityLabel'],
  },
  {
    label: 'Planning',
    tokens: ['projectName', 'cycleName', 'cycleNumber', 'milestoneName', 'estimate', 'dueDate'],
  },
  {
    label: 'People',
    tokens: ['assigneeName', 'creatorName'],
  },
  {
    label: 'Labels',
    tokens: ['labels'],
  },
] satisfies ClockifyDescriptionTemplateTokenGroup[]

export const clockifyDescriptionTemplateTokens = clockifyDescriptionTemplateTokenGroups.flatMap(group => group.tokens)

export const sampleClockifyDescriptionTemplateValues = {
  assigneeName: 'Alex Chen',
  creatorName: 'Maya Patel',
  cycleName: 'Cycle 42',
  cycleNumber: 42,
  dueDate: '2026-06-26',
  estimate: 3,
  identifier: 'ENG-123',
  labels: 'frontend, settings',
  milestoneName: 'Desktop beta',
  number: 123,
  priorityLabel: 'High',
  projectName: 'Clinear Desktop',
  stateName: 'In Progress',
  teamKey: 'ENG',
  teamName: 'Engineering',
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
