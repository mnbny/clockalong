import { useHotkeys } from '@mantine/hooks'
import { IconLogout, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect } from 'react'

import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { useStorage } from '../services/storage/useStorage'
import { clinearAuth, isClinearAuthenticated } from '../services/tauri/authClient'
import { appToast } from './AppToaster'
import { MoonBunnyLogo } from './MoonBunnyLogo'

export function AppHeader() {
  const [theme, setTheme] = useStorage('theme')
  const authState = useTauriClinearAuthState()
  const authenticated = isClinearAuthenticated(authState.value)

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

  const disconnectLinear = async () => {
    console.info('[clinear auth] disconnectLinear: requested from header')

    try {
      const result = await clinearAuth.disconnectLinear()
      console.info(`[clinear auth] disconnectLinear: revocation_status=${result.revocationStatus}`)
      appToast.success('Linear disconnected.')
    } catch (error) {
      console.error('[clinear auth] disconnectLinear: failed', error)
      appToast.error('Could not disconnect Linear.', {
        description: getErrorMessage(error),
      })
    }
  }

  return (
    <div
      className="border-base-300 bg-base-200 sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4"
      data-tauri-drag-region>
      <div />

      <h1 className="pointer-events-none flex h-10 min-w-0 items-center gap-3 justify-self-center text-lg leading-none font-semibold">
        <span className="truncate">Moon Bunny</span>
        <MoonBunnyLogo className="size-10 self-center" />
        <span className="truncate">Clinear</span>
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
              aria-label="Disconnect Linear"
              onClick={() => void disconnectLinear()}>
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
