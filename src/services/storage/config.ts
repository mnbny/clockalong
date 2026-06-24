import { type StorageConfig, StorageService } from './storage'

export const storagePath = 'settings.json'
export const themeOptions = [
  { theme: 'night', appearance: 'dark' },
  { theme: 'winter', appearance: 'light' },
] as const
export const defaultViewOptions = ['dashboard', 'recent', 'active'] as const
export const refreshIntervalOptions = ['manual', '5m', '15m', '30m'] as const

export type ThemeOption = (typeof themeOptions)[number]
export type DefaultViewOption = (typeof defaultViewOptions)[number]
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
  displayName: {
    type: 'string',
    default: 'Moonbunny Clienear',
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
    version: 1,
  },
} satisfies StorageConfig

export const storage = new StorageService(storageConfig, storagePath)
