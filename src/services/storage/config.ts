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
    default: themeOptions[0] as ThemeOption,
    version: 3,
  },
} satisfies StorageConfig

export const storage = new StorageService(storageConfig, storagePath)
