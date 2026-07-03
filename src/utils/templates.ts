export type TemplateValue = string | number | null | undefined

export type FormatTemplateOptions = {
  fallback?: string
  knownTokens?: Iterable<string>
}

export type GithubInternalRef = {
  itemType: 'issue' | 'pr'
  number: number
  provider: 'github'
  repository: string
}

export type LinearInternalRef = {
  issueIdentifier: string
  provider: 'linear'
  workspaceSlug: string
}

export type InternalRef = GithubInternalRef | LinearInternalRef

export const internalRefTemplateToken = 'internal-ref'

const templateTokenPattern = /\{([A-Za-z][A-Za-z0-9-]*)\}/g
const internalRefPattern = /\bref:(github|linear):([^\s),;\]}]+)/g

export function parseTemplateTokens(template: string) {
  const tokens = new Set<string>()

  for (const match of template.matchAll(templateTokenPattern)) {
    const token = match[1]

    if (token) {
      tokens.add(token)
    }
  }

  return [...tokens]
}

export function getUnknownTemplateTokens(template: string, knownTokens: Iterable<string>) {
  const knownTokenSet = new Set<string>(knownTokens)

  return parseTemplateTokens(template).filter(token => !knownTokenSet.has(token))
}

export function formatTemplate(
  template: string,
  values: Record<string, TemplateValue>,
  { fallback = '', knownTokens }: FormatTemplateOptions = {},
) {
  const knownTokenSet = knownTokens ? new Set<string>(knownTokens) : null

  return cleanupFormattedTemplate(
    template.replace(templateTokenPattern, (match, token: string) => {
      if (knownTokenSet && !knownTokenSet.has(token)) {
        return match
      }

      return formatTemplateValue(values[token], fallback)
    }),
  )
}

export function formatTemplateValue(value: TemplateValue, fallback: string) {
  if (value === null || value === undefined) {
    return fallback
  }

  if (typeof value === 'string' && !value.trim()) {
    return fallback
  }

  return String(value)
}

export function cleanupFormattedTemplate(description: string) {
  return description
    .replace(/\s+/g, ' ')
    .replace(/\s+([:,\]])/g, '$1')
    .replace(/([[(])\s+/g, '$1')
    .trim()
}

export function formatInternalRef(ref: InternalRef) {
  if (ref.provider === 'github') {
    return `ref:github:${ref.repository}:${ref.itemType}:${ref.number}`
  }

  return `ref:linear:${ref.workspaceSlug}:${ref.issueIdentifier}`
}

export function parseInternalRefs(description: string | null | undefined): InternalRef[] {
  if (!description) {
    return []
  }

  return [...description.matchAll(internalRefPattern)].flatMap(match => {
    const provider = match[1]
    const body = match[2]

    if (!provider || !body) {
      return []
    }

    return parseInternalRef(provider, body)
  })
}

export function normalizeInternalRef(value: string) {
  return value.trim().toLocaleLowerCase()
}

function parseInternalRef(provider: string, body: string): InternalRef[] {
  const parts = body.split(':')

  if (provider === 'github') {
    const [repository, itemType, numberValue] = parts
    const number = Number(numberValue)

    if (!repository || !isGithubInternalRefItemType(itemType) || !Number.isFinite(number)) {
      return []
    }

    return [{ itemType, number, provider, repository }]
  }

  if (provider === 'linear') {
    const [workspaceSlug, issueIdentifier] = parts

    if (!workspaceSlug || !issueIdentifier) {
      return []
    }

    return [{ issueIdentifier, provider, workspaceSlug }]
  }

  return []
}

function isGithubInternalRefItemType(value: string | undefined): value is GithubInternalRef['itemType'] {
  return value === 'issue' || value === 'pr'
}
