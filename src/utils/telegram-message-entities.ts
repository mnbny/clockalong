import type { TextEntity } from '../services/telegram/chat-data'

export type EntityPart = string | { entity: TextEntity; children: EntityPart[] }

export function safeTelegramLink(value: string, implicitHttps = false) {
  if (!value || value.split('').some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127))
    return null
  try {
    const url = new URL(implicitHttps && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value)
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname && !url.username && !url.password)
      return url.href
    if (
      url.protocol === 'mailto:' &&
      /^[^?&#\s@]+@[^?&#\s@]+\.[^?&#\s@]+$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    )
      return url.href
  } catch {
    return null
  }
  return null
}

const priority = (entity: TextEntity) => {
  if (entity.kind === 'messageEntityBlockquote' || entity.kind === 'messageEntityPre') return 0
  if (entity.kind === 'messageEntitySpoiler') return 1
  if (['messageEntityUrl', 'messageEntityTextUrl', 'messageEntityEmail'].includes(entity.kind)) return 2
  return 3
}

/** Telegram offsets and JS slice both use UTF-16. Invalid ranges never remove source text. */
export function messageEntityParts(text: string, input: TextEntity[]) {
  const boundary = (index: number) =>
    !(
      index > 0 &&
      index < text.length &&
      /[\uD800-\uDBFF]/.test(text[index - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[index])
    )
  const entities = input
    .filter(
      entity =>
        Number.isSafeInteger(entity.offset) &&
        Number.isSafeInteger(entity.length) &&
        entity.offset >= 0 &&
        entity.length > 0 &&
        entity.offset + entity.length <= text.length &&
        boundary(entity.offset) &&
        boundary(entity.offset + entity.length),
    )
    .sort(
      (a, b) => priority(a) - priority(b) || a.offset - b.offset || b.length - a.length || a.kind.localeCompare(b.kind),
    )
  const points = [
    ...new Set([0, text.length, ...entities.flatMap(entity => [entity.offset, entity.offset + entity.length])]),
  ].sort((a, b) => a - b)
  const root: EntityPart[] = []
  let stack: { entity: TextEntity; children: EntityPart[] }[] = []
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const end = points[index]
    let link = false
    const active = entities.filter(entity => {
      if (entity.offset > start || entity.offset + entity.length < end) return false
      if (priority(entity) !== 2) return true
      if (link) return false
      link = true
      return true
    })
    let shared = 0
    while (shared < stack.length && stack[shared].entity === active[shared]) shared++
    stack = stack.slice(0, shared)
    for (const entity of active.slice(shared)) {
      const part = { entity, children: [] as EntityPart[] }
      ;(stack[stack.length - 1]?.children ?? root).push(part)
      stack.push(part)
    }
    ;(stack[stack.length - 1]?.children ?? root).push(text.slice(start, end))
  }
  return root
}
