import { useHotkeys } from '@mantine/hooks'
import { IconLogout, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { useStorage } from '../services/storage/useStorage'
import { MoonBunnyLogo } from './MoonBunnyLogo'

export function AppHeader() {
  const navigate = useNavigate()
  const [theme, setTheme] = useStorage('theme')
  const authState = useAppAuth()
  const authenticated = authState.value.clockifyAuthenticated

  const toggleTheme = useCallback(() => {
    void setTheme(current =>
      current.theme === 'abyss' ? { theme: 'emerald', appearance: 'light' } : { theme: 'abyss', appearance: 'dark' },
    )
  }, [setTheme])

  useHotkeys([['mod+shift+A', toggleTheme, { preventDefault: true }]])

  useEffect(() => {
    document.documentElement.dataset.theme = theme.theme

    if (!isTauri()) {
      return
    }

    void getCurrentWindow()
      .setTheme(theme.appearance)
      .catch(error => {
        console.warn('Error setting native window theme:', error)
      })
  }, [theme])

  const goToSignIn = async () => {
    console.info('[clockalong auth] goToSignIn: requested from header')
    await navigate({ to: '/sign-in' })
  }

  return (
    <div
      className="border-base-300 bg-base-200 sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4"
      data-tauri-drag-region>
      <div />

      <h1 className="pointer-events-none flex h-10 min-w-0 items-center gap-3 justify-self-center text-lg leading-none font-semibold">
        <span className="truncate">Moon Bunny</span>
        <MoonBunnyLogo className="size-10 self-center" />
        <span className="truncate">Clockalong</span>
      </h1>

      <div className="flex items-center gap-1 justify-self-end">
        {authenticated ? (
          <>
            <Link to="/settings" className="btn btn-square btn-ghost" aria-label="Settings">
              <IconSettings className="size-5" />
            </Link>
            <button
              className="btn btn-square btn-ghost"
              type="button"
              aria-label="Go to sign in"
              onClick={() => void goToSignIn()}>
              <IconLogout className="size-5" />
            </button>
          </>
        ) : null}
        <label className="swap swap-rotate btn btn-square btn-ghost">
          <input aria-label="Toggle theme" checked={theme.theme === 'abyss'} type="checkbox" onChange={toggleTheme} />
          <IconSun className="swap-off size-5" />
          <IconMoon className="swap-on size-5" />
        </label>
      </div>
    </div>
  )
}
