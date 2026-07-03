export const githubWorkItemSyncIntervalOptions = ['manual', '5m', '15m', '30m', '1h'] as const

export type GithubWorkItemSyncIntervalOption = (typeof githubWorkItemSyncIntervalOptions)[number]

export const defaultGithubWorkItemSyncInterval: GithubWorkItemSyncIntervalOption = '30m'

export function getGithubWorkItemSyncIntervalLabel(option: GithubWorkItemSyncIntervalOption) {
  switch (option) {
    case 'manual':
      return 'Manual'
    case '5m':
      return 'Every 5 minutes'
    case '15m':
      return 'Every 15 minutes'
    case '30m':
      return 'Every 30 minutes'
    case '1h':
      return 'Every hour'
  }
}

export function getGithubWorkItemSyncIntervalMilliseconds(option: GithubWorkItemSyncIntervalOption) {
  switch (option) {
    case 'manual':
      return false
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '30m':
      return 30 * 60_000
    case '1h':
      return 60 * 60_000
  }
}
