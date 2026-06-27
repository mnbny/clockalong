export type TemplateValue = string | number | null | undefined

export type FormatTemplateOptions = {
  fallback?: string
  knownTokens?: Iterable<string>
}

const templateTokenPattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g

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
