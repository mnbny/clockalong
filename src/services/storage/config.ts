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
export const themeOptions = [
  { theme: 'abyss', appearance: 'dark' },
  { theme: 'emerald', appearance: 'light' },
] as const
export const defaultViewOptions = ['dashboard', 'recent', 'active'] as const
export const refreshIntervalOptions = ['manual', '5m', '15m', '30m'] as const

export type ClockifyQuickTimerEntryLink = {
  quickTimerId: string
  values: Record<string, string>
}
export type ClockifyQuickTimerEntryLinkRegistry = Record<string, ClockifyQuickTimerEntryLink>
export type ClockifyDefaultProject = {
  projectId: string
  projectName: string
  workspaceId: string
  workspaceName: string
} | null
export type GithubSelectedRepository = {
  fullName: string
  id: number
  name: string
  owner: string
  private: boolean
  url: string
}
export type GithubVisibleWorkItemTypes = {
  issues: boolean
  pullRequests: boolean
}
export const defaultGithubWorkItemSyncLimit = 30
export const maxGithubWorkItemSyncLimit = 100
export type ThemeOption = (typeof themeOptions)[number]
export type DefaultViewOption = (typeof defaultViewOptions)[number]
export type QuickTimerPreset = {
  descriptionTemplate: string
  icon: string
  id: string
  name: string
}
export type QuickTimersCacheEntry = {
  id: string
  values: Record<string, string>
}
export type RefreshIntervalOption = (typeof refreshIntervalOptions)[number]

const storageConfig = {
  compactRows: {
    type: 'boolean',
    default: false,
    version: 1,
  },
  defaultView: {
    type: 'string',
    default: defaultViewOptions[0] as DefaultViewOption,
    version: 1,
  },
  density: {
    type: 'number',
    default: 60,
    version: 1,
  },
  desktopAlerts: {
    type: 'boolean',
    default: true,
    version: 1,
  },
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
  clockifyQuickTimerEntryLinks: {
    type: 'object',
    default: {} as ClockifyQuickTimerEntryLinkRegistry,
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
  displayName: {
    type: 'string',
    default: 'Moon Bunny Clockalong',
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
  githubAuthoredWorkItemsOnly: {
    type: 'boolean',
    default: true,
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
  refreshInterval: {
    type: 'string',
    default: refreshIntervalOptions[0] as RefreshIntervalOption,
    version: 1,
  },
  theme: {
    type: 'object',
    default: themeOptions[0] as ThemeOption,
    version: 3,
  },
} satisfies StorageConfig

export const storage = new StorageService(storageConfig, storagePath)
