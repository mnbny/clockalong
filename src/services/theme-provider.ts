import type { ThemeOption } from './storage/config'
import type { PropsWithChildren } from 'react'

import { createContext, createElement, useContext, useLayoutEffect } from 'react'

import { useStorage } from './storage/useStorage'
import { applyTheme, resolveTheme } from './theme'

function useThemeData(initialTheme: ThemeOption) {
  const [storedTheme, setStoredTheme] = useStorage('theme', initialTheme)
  const theme = resolveTheme(storedTheme)

  useLayoutEffect(() => {
    void applyTheme(theme)
  }, [theme])

  const setTheme = (name: string) => setStoredTheme(resolveTheme({ theme: name }))

  return { theme, setTheme }
}

type ThemeContext = ReturnType<typeof useThemeData>
const ThemeContext = createContext<ThemeContext | null>(null)

export function ThemeProvider({ children, initialTheme }: PropsWithChildren<{ initialTheme: ThemeOption }>) {
  const data = useThemeData(initialTheme)
  return createElement(ThemeContext.Provider, { value: data }, children)
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
