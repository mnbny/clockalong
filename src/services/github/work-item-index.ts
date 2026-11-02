import type { SyncedGithubWorkItem } from './sync'

export type StoredGithubWorkItem = SyncedGithubWorkItem & { refKey: string }

export function withGithubRefKey(item: SyncedGithubWorkItem) {
  return {
    ...item,
    refKey:
      `ref:github:${item.repositoryFullName}:${item.type === 'issue' ? 'issue' : 'pr'}:${item.number}`.toLocaleLowerCase(),
  }
}

export type GithubWorkItemIndex = {
  token: string
  updatedAt: string
  rowId: string
  repository: string
  type: SyncedGithubWorkItem['type']
  state: string
  title: string
  identifier: string
}

export type GithubAuthorIndex = {
  id: string
  username: string
  usernameKey: string
  avatarUrl: string | null
  repository: string
  type: SyncedGithubWorkItem['type']
}

export function normalizeGithubFilter(value: string) {
  return value.trim().toLowerCase()
}

export function getGithubIndexEntries(item: SyncedGithubWorkItem): GithubWorkItemIndex[] {
  const tokens = new Set(['all'])
  if (item.author) tokens.add(`author:${normalizeGithubFilter(item.author)}`)
  for (const label of item.item.labels ?? []) {
    const name = typeof label === 'string' ? label : label.name
    if (name) tokens.add(`label:${normalizeGithubFilter(name)}`)
  }
  if (item.involvementReasons?.length) tokens.add('involvement')
  return [...tokens].map(token => ({
    token,
    updatedAt: item.updatedAt,
    rowId: item.id,
    repository: item.repositoryFullName,
    type: item.type,
    state: item.state,
    title: item.title.toLowerCase(),
    identifier: `${item.type === 'pullRequest' ? 'PR' : 'Issue'}#${item.number}`.toLowerCase(),
  }))
}

export function getGithubAuthorEntry(item: SyncedGithubWorkItem): GithubAuthorIndex | undefined {
  if (!item.author) return undefined
  return {
    id: item.id,
    username: item.author,
    usernameKey: normalizeGithubFilter(item.author),
    avatarUrl: item.authorAvatarUrl,
    repository: item.repositoryFullName,
    type: item.type,
  }
}
