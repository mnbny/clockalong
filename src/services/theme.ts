import { defaultTheme, type ThemeOption, themeOptions } from './storage/config'
import { app } from './tauri/app-client'

export function resolveTheme(value: unknown) {
  const name = typeof value === 'object' && value !== null && 'theme' in value ? value.theme : undefined
  return themeOptions.find(option => option.theme === name) ?? defaultTheme
}

export async function applyTheme(theme: ThemeOption) {
  document.documentElement.dataset.theme = theme.theme
  document.documentElement.dataset.appearance = theme.appearance

  try {
    await app.setWindowTheme(theme.appearance)
  } catch (error) {
    console.warn('Could not set native window theme:', error)
  }
}
