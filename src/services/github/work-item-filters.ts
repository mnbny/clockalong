import type { GithubSelectedAuthor, GithubSelectedLabel } from '../storage/config'

export function getGithubSelectedAuthorUsernames(viewerUsername: string | undefined, authors: GithubSelectedAuthor[]) {
  return new Set(
    [viewerUsername, ...authors.map(author => author.username)]
      .filter((username): username is string => Boolean(username))
      .map(normalizeGithubUsername),
  )
}

export function getGithubSelectedLabelNames(labels: GithubSelectedLabel[]) {
  return new Set(labels.map(label => normalizeGithubLabelName(label.name)))
}

export function mergeGithubAuthors(...authorGroups: GithubSelectedAuthor[][]) {
  const authors = new Map<string, GithubSelectedAuthor>()
  for (const authorGroup of authorGroups) {
    for (const author of authorGroup) {
      const usernameKey = normalizeGithubUsername(author.username)
      const existingAuthor = authors.get(usernameKey)
      if (!existingAuthor || (!existingAuthor.avatarUrl && author.avatarUrl)) authors.set(usernameKey, author)
    }
  }
  return [...authors.values()].sort(compareGithubAuthors)
}

export function compareGithubAuthors(left: GithubSelectedAuthor, right: GithubSelectedAuthor) {
  return left.username.localeCompare(right.username, undefined, { sensitivity: 'base' })
}

export function normalizeGithubUsername(username: string) {
  return username.trim().toLowerCase()
}

export function normalizeGithubLabelName(name: string) {
  return name.trim().toLowerCase()
}
