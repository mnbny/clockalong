import { formatTemplate, getUnknownTemplateTokens } from '../../utils/templates'

export const defaultGithubIssueDescriptionTemplate = 'Issue#{number} - {repository}: {title}'
export const defaultGithubPullRequestDescriptionTemplate =
  'PR#{number} - {repository}: {title} - ({headBranch} -> {baseBranch})'
export const defaultGithubIssueDescriptionTemplateFallback = 'n/a'
export const defaultGithubPullRequestDescriptionTemplateFallback = 'n/a'

export type GithubIssueDescriptionTemplateToken =
  | 'title'
  | 'number'
  | 'url'
  | 'repository'
  | 'owner'
  | 'author'
  | 'state'

export type GithubPullRequestDescriptionTemplateToken =
  | GithubIssueDescriptionTemplateToken
  | 'headBranch'
  | 'baseBranch'
export type GithubDescriptionTemplateToken =
  | GithubIssueDescriptionTemplateToken
  | GithubPullRequestDescriptionTemplateToken

export type GithubIssueDescriptionTemplateValues = Partial<
  Record<GithubIssueDescriptionTemplateToken, string | number | null | undefined>
>
export type GithubPullRequestDescriptionTemplateValues = Partial<
  Record<GithubPullRequestDescriptionTemplateToken, string | number | null | undefined>
>

export type FormatGithubDescriptionTemplateOptions = {
  fallback?: string
}

export type GithubDescriptionTemplateTokenGroup<TToken extends string> = {
  label: string
  tokens: TToken[]
}

export const githubIssueDescriptionTemplateTokenGroups = [
  {
    label: 'Issue',
    tokens: ['title', 'number', 'url'],
  },
  {
    label: 'Repository',
    tokens: ['repository', 'owner', 'author', 'state'],
  },
] satisfies GithubDescriptionTemplateTokenGroup<GithubIssueDescriptionTemplateToken>[]

export const githubPullRequestDescriptionTemplateTokenGroups = [
  {
    label: 'Pull request',
    tokens: ['title', 'number', 'url'],
  },
  {
    label: 'Repository',
    tokens: ['repository', 'owner', 'author', 'state'],
  },
  {
    label: 'Branches',
    tokens: ['headBranch', 'baseBranch'],
  },
] satisfies GithubDescriptionTemplateTokenGroup<GithubPullRequestDescriptionTemplateToken>[]

export const githubIssueDescriptionTemplateTokens = githubIssueDescriptionTemplateTokenGroups.flatMap(
  group => group.tokens,
)
export const githubPullRequestDescriptionTemplateTokens = githubPullRequestDescriptionTemplateTokenGroups.flatMap(
  group => group.tokens,
)

export const sampleGithubIssueDescriptionTemplateValues = {
  author: 'alexchen',
  number: 42,
  owner: 'moon-bunny',
  repository: 'moon-bunny/clockalong',
  state: 'open',
  title: 'Settings should remember selected repositories',
  url: 'https://github.com/moon-bunny/clockalong/issues/42',
} satisfies GithubIssueDescriptionTemplateValues

export const sampleGithubPullRequestDescriptionTemplateValues = {
  author: 'alexchen',
  baseBranch: 'main',
  headBranch: 'fix/settings-repo-picker',
  number: 128,
  owner: 'moon-bunny',
  repository: 'moon-bunny/clockalong',
  state: 'open',
  title: 'Fix GitHub settings repository picker',
  url: 'https://github.com/moon-bunny/clockalong/pull/128',
} satisfies GithubPullRequestDescriptionTemplateValues

export function formatGithubIssueDescriptionTemplate(
  template: string,
  values: GithubIssueDescriptionTemplateValues,
  { fallback = defaultGithubIssueDescriptionTemplateFallback }: FormatGithubDescriptionTemplateOptions = {},
) {
  return formatTemplate(template, values, { fallback, knownTokens: githubIssueDescriptionTemplateTokens })
}

export function formatGithubPullRequestDescriptionTemplate(
  template: string,
  values: GithubPullRequestDescriptionTemplateValues,
  { fallback = defaultGithubPullRequestDescriptionTemplateFallback }: FormatGithubDescriptionTemplateOptions = {},
) {
  return formatTemplate(template, values, { fallback, knownTokens: githubPullRequestDescriptionTemplateTokens })
}

export function getUnknownGithubIssueDescriptionTemplateTokens(template: string) {
  return getUnknownTemplateTokens(template, githubIssueDescriptionTemplateTokens)
}

export function getUnknownGithubPullRequestDescriptionTemplateTokens(template: string) {
  return getUnknownTemplateTokens(template, githubPullRequestDescriptionTemplateTokens)
}
