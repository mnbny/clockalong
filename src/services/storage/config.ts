import { PaginationOrderBy } from '@linear/sdk'

import {
  defaultClockifyDescriptionTemplate,
  defaultClockifyDescriptionTemplateFallback,
} from '../clockify/description-template'
import { type StorageConfig, StorageService } from './storage'

export const storagePath = 'settings.json'
export const themeOptions = [
  { theme: 'abyss', appearance: 'dark' },
  { theme: 'emerald', appearance: 'light' },
] as const
export const defaultViewOptions = ['dashboard', 'recent', 'active'] as const
export const linearTicketRefetchIntervalOptions = ['manual', '5m', '15m', '30m', '1h'] as const
export const linearTicketSortByOptions = [PaginationOrderBy.CreatedAt, PaginationOrderBy.UpdatedAt] as const
export const linearTicketSortOrderOptions = ['custom', 'status', 'created', 'updated', 'alphabetical'] as const
export const refreshIntervalOptions = ['manual', '5m', '15m', '30m'] as const

export type ClockifyLinearEntryLink = {
  linearIssueId: string
  linkedAt: string
}
export type ClockifyLinearEntryLinkRegistry = Record<string, ClockifyLinearEntryLink>
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
export type ThemeOption = (typeof themeOptions)[number]
export type DefaultViewOption = (typeof defaultViewOptions)[number]
export type LinearTicketRefetchIntervalOption = (typeof linearTicketRefetchIntervalOptions)[number]
export type LinearTicketSortByOption = (typeof linearTicketSortByOptions)[number]
export type LinearTicketSortOrderOption = (typeof linearTicketSortOrderOptions)[number]
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
  clockifyLinearEntryLinks: {
    type: 'object',
    default: {} as ClockifyLinearEntryLinkRegistry,
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
    default: 6,
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
    default: 'Moon Bunny Clinear',
    version: 1,
  },
  linearTicketFetchLimit: {
    type: 'number',
    default: 50,
    version: 1,
  },
  linearTicketRefetchInterval: {
    type: 'string',
    default: '30m' as LinearTicketRefetchIntervalOption,
    version: 1,
  },
  linearTicketSortBy: {
    type: 'string',
    default: linearTicketSortByOptions[0] as LinearTicketSortByOption,
    version: 1,
  },
  linearTicketSortOrder: {
    type: 'string',
    default: linearTicketSortOrderOptions[0] as LinearTicketSortOrderOption,
    version: 2,
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
