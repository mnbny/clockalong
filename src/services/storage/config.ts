import { type StorageConfig, StorageService } from './storage'

export const storagePath = 'settings.json'
export const themeOptions = [
  { theme: 'night', appearance: 'dark' },
  { theme: 'winter', appearance: 'light' },
] as const

export type ThemeOption = (typeof themeOptions)[number]

const storageConfig = {
  theme: {
    type: 'object',
    default: themeOptions[0] as ThemeOption,
    version: 1,
  },
} satisfies StorageConfig

export const storage = new StorageService(storageConfig, storagePath)
