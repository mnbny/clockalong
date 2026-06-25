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

const templateTokenPattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const knownTemplateTokens = new Set<string>(clockifyDescriptionTemplateTokens)

export function formatClockifyDescriptionTemplate(
  template: string,
  values: ClockifyDescriptionTemplateValues,
  { fallback = defaultClockifyDescriptionTemplateFallback }: FormatClockifyDescriptionTemplateOptions = {},
) {
  return cleanupFormattedDescription(
    template.replace(templateTokenPattern, (match, token: string) => {
      if (!knownTemplateTokens.has(token)) {
        return match
      }

      return formatTemplateValue(values[token as ClockifyDescriptionTemplateToken], fallback)
    }),
  )
}

export function getUnknownClockifyDescriptionTemplateTokens(template: string) {
  const unknownTokens = new Set<string>()

  for (const match of template.matchAll(templateTokenPattern)) {
    const token = match[1]

    if (token && !knownTemplateTokens.has(token)) {
      unknownTokens.add(token)
    }
  }

  return [...unknownTokens]
}

function formatTemplateValue(value: string | number | null | undefined, fallback: string) {
  if (value === null || value === undefined) {
    return fallback
  }

  if (typeof value === 'string' && !value.trim()) {
    return fallback
  }

  return String(value)
}

function cleanupFormattedDescription(description: string) {
  return description
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,\]])/g, '$1')
    .replace(/([[(])\s+/g, '$1')
    .trim()
}
