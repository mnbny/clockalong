import {
  defaultClockifyDescriptionTemplate,
  defaultClockifyDescriptionTemplateFallback,
} from '../clockify/description-template'
import { defaultClockifyEntrySyncDays, defaultClockifyEntrySyncInterval } from '../clockify/sync-settings'
import {
  defaultGithubIssueDescriptionTemplate,
  defaultGithubIssueDescriptionTemplateFallback,
  defaultGithubPullRequestDescriptionTemplate,
  defaultGithubPullRequestDescriptionTemplateFallback,
} from '../github/description-template'
import { defaultGithubWorkItemSyncInterval } from '../github/sync-settings'
import {
  defaultLinearTicketSortOrder,
  defaultLinearTicketSyncInterval,
  defaultLinearTicketSyncLimit,
  defaultLinearTicketSyncOrderBy,
} from '../linear/ticket-settings'
import { type StorageConfig, StorageService } from './storage'

export const storagePath = 'settings.json'
export const defaultTheme = { theme: 'halloween', appearance: 'dark' } as const
export const themeOptions = [
  { theme: 'abyss', appearance: 'dark' },
  { theme: 'acid', appearance: 'light' },
  { theme: 'aqua', appearance: 'dark' },
  { theme: 'autumn', appearance: 'light' },
  { theme: 'black', appearance: 'dark' },
  { theme: 'bumblebee', appearance: 'light' },
  { theme: 'business', appearance: 'dark' },
  { theme: 'caramellatte', appearance: 'light' },
  { theme: 'cmyk', appearance: 'light' },
  { theme: 'coffee', appearance: 'dark' },
  { theme: 'corporate', appearance: 'light' },
  { theme: 'cupcake', appearance: 'light' },
  { theme: 'cyberpunk', appearance: 'light' },
  { theme: 'dark', appearance: 'dark' },
  { theme: 'dim', appearance: 'dark' },
  { theme: 'dracula', appearance: 'dark' },
  { theme: 'emerald', appearance: 'light' },
  { theme: 'fantasy', appearance: 'light' },
  { theme: 'forest', appearance: 'dark' },
  { theme: 'garden', appearance: 'light' },
  defaultTheme,
  { theme: 'lemonade', appearance: 'light' },
  { theme: 'light', appearance: 'light' },
  { theme: 'lofi', appearance: 'light' },
  { theme: 'luxury', appearance: 'dark' },
  { theme: 'night', appearance: 'dark' },
  { theme: 'nord', appearance: 'light' },
  { theme: 'pastel', appearance: 'light' },
  { theme: 'retro', appearance: 'light' },
  { theme: 'silk', appearance: 'light' },
  { theme: 'sunset', appearance: 'dark' },
  { theme: 'synthwave', appearance: 'dark' },
  { theme: 'valentine', appearance: 'light' },
  { theme: 'winter', appearance: 'light' },
  { theme: 'wireframe', appearance: 'light' },
] as const

export type ClockifyProject = {
  projectId: string
  projectName: string
  workspaceId: string
  workspaceName: string
}
export type ClockifyDefaultProject = ClockifyProject | null
export type ClockifyOverrideProject = ClockifyProject | null
export type GithubSelectedRepository = {
  fullName: string
  id: number
  name: string
  owner: string
  private: boolean
  url: string
}
export type GithubSelectedAuthor = {
  avatarUrl: string | null
  username: string
}
export type GithubSelectedLabel = {
  color: string
  name: string
}
export type GithubVisibleWorkItemTypes = {
  issues: boolean
  pullRequests: boolean
}
export const defaultGithubWorkItemSyncLimit = 30
export const maxGithubWorkItemSyncLimit = 100
export type ThemeOption = (typeof themeOptions)[number]
export type QuickTimerPreset = {
  descriptionTemplate: string
  icon: string
  id: string
  name: string
}
export type QuickTimersActiveEntry = {
  entryId: string
  quickTimerId: string
} | null
export type QuickTimersCacheEntry = {
  id: string
  values: Record<string, string>
}

const storageConfig = {
  clockifyBillable: {
    type: 'boolean',
    default: true,
    version: 1,
  },
  clockifyDefaultProject: {
    type: 'object',
    default: null as ClockifyDefaultProject,
    version: 1,
  },
  clockifyOverrideProject: {
    type: 'object',
    default: null as ClockifyOverrideProject,
    version: 1,
  },
  clockifyOverrideProjectVisibility: {
    type: 'boolean',
    default: false,
    version: 1,
  },
  clockifyDescriptionTemplate: {
    type: 'string',
    default: defaultClockifyDescriptionTemplate,
    version: 1,
  },
  clockifyDescriptionTemplateFallback: {
    type: 'string',
    default: defaultClockifyDescriptionTemplateFallback,
    version: 1,
  },
  clockifyEntrySyncDays: {
    type: 'number',
    default: defaultClockifyEntrySyncDays,
    version: 1,
  },
  clockifyEntrySyncInterval: {
    type: 'string',
    default: defaultClockifyEntrySyncInterval,
    version: 1,
  },
  quickTimersEnabled: {
    type: 'boolean',
    default: true,
    version: 1,
  },
  quickTimersColumns: {
    type: 'number',
    default: 5,
    version: 1,
  },
  quickTimers: {
    type: 'object',
    default: [] as QuickTimerPreset[],
    version: 1,
  },
  quickTimersCache: {
    type: 'object',
    default: [] as QuickTimersCacheEntry[],
    version: 1,
  },
  quickTimersActiveEntry: {
    type: 'object',
    default: null as QuickTimersActiveEntry,
    version: 1,
  },
  menuBarVisible: {
    type: 'boolean',
    default: true,
    version: 1,
  },
  mcpServerEnabled: {
    type: 'boolean',
    default: false,
    version: 1,
  },
  linearTicketSyncLimit: {
    type: 'number',
    default: defaultLinearTicketSyncLimit,
    version: 1,
  },
  linearTicketSyncInterval: {
    type: 'string',
    default: defaultLinearTicketSyncInterval,
    version: 1,
  },
  linearTicketSyncOrderBy: {
    type: 'string',
    default: defaultLinearTicketSyncOrderBy,
    version: 1,
  },
  linearTicketSortOrder: {
    type: 'string',
    default: defaultLinearTicketSortOrder,
    version: 2,
  },
  githubSelectedRepositories: {
    type: 'object',
    default: [] as GithubSelectedRepository[],
    version: 1,
  },
  githubVisibleWorkItemTypes: {
    type: 'object',
    default: { issues: true, pullRequests: true } as GithubVisibleWorkItemTypes,
    version: 1,
  },
  githubWorkItemSyncLimit: {
    type: 'number',
    default: defaultGithubWorkItemSyncLimit,
    version: 1,
  },
  githubWorkItemSyncInterval: {
    type: 'string',
    default: defaultGithubWorkItemSyncInterval,
    version: 1,
  },
  githubSelectedAuthors: {
    type: 'object',
    default: [] as GithubSelectedAuthor[],
    version: 1,
  },
  githubSelectedLabels: {
    type: 'object',
    default: [] as GithubSelectedLabel[],
    version: 1,
  },
  githubShowClosedWorkItems: {
    type: 'boolean',
    default: false,
    version: 1,
  },
  githubIssueDescriptionTemplate: {
    type: 'string',
    default: defaultGithubIssueDescriptionTemplate,
    version: 1,
  },
  githubIssueDescriptionTemplateFallback: {
    type: 'string',
    default: defaultGithubIssueDescriptionTemplateFallback,
    version: 1,
  },
  githubPullRequestDescriptionTemplate: {
    type: 'string',
    default: defaultGithubPullRequestDescriptionTemplate,
    version: 1,
  },
  githubPullRequestDescriptionTemplateFallback: {
    type: 'string',
    default: defaultGithubPullRequestDescriptionTemplateFallback,
    version: 1,
  },
  theme: {
    type: 'object',
    default: defaultTheme as ThemeOption,
    version: 4,
  },
} satisfies StorageConfig

export const storage = new StorageService(storageConfig, storagePath)
