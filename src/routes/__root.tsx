import { IconBell, IconLogout, IconMoon, IconSearch, IconSettings, IconSun } from '@tabler/icons-react'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'

import { appToast, AppToaster } from '../components/AppToaster'
import { MoonBunnyLogo } from '../components/MoonBunnyLogo'
import { useDevTools } from '../hooks/useDevTools'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { useStorage } from '../services/storage/useStorage'
import { clinearAuth, isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useDevTools()
  const [theme, setTheme] = useStorage('theme')
  const [disconnectingLinear, setDisconnectingLinear] = useState(false)
  const authState = useTauriClinearAuthState()
  const authenticated = isClinearAuthenticated(authState.value)

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
    setDisconnectingLinear(true)

    try {
      const result = await clinearAuth.disconnectLinear()
      console.info(`[clinear auth] disconnectLinear: revocation_status=${result.revocationStatus}`)

      if (result.revocationStatus === 'failed') {
        appToast.warning('Linear disconnected on this device.', {
          description: 'Linear revocation could not be confirmed. You may revoke access from Linear settings.',
        })
      } else {
        appToast.success('Linear disconnected.')
      }
    } catch (error) {
      console.error('[clinear auth] disconnectLinear: failed', error)
      appToast.error('Could not disconnect Linear.', {
        description: getErrorMessage(error),
      })
    } finally {
      setDisconnectingLinear(false)
    }
  }

  return (
    <main className="bg-base-100 text-base-content grid h-dvh w-dvw grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div
        className="border-base-300 bg-base-200 sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4"
        data-tauri-drag-region>
        <div />

        <h1 className="pointer-events-none flex h-10 min-w-0 items-center gap-3 justify-self-center text-lg leading-none font-semibold">
          <span className="truncate">Moonbunny</span>
          <MoonBunnyLogo className="size-10 self-center" />
          <span className="truncate">Clinear</span>
        </h1>

        <div className="flex items-center gap-1 justify-self-end">
          {authenticated ? (
            <>
              <button className="btn btn-square btn-ghost" type="button" aria-label="Search">
                <IconSearch className="size-5" />
              </button>
              <button className="btn btn-square btn-ghost" type="button" aria-label="Notifications">
                <IconBell className="size-5" />
              </button>
              <Link to="/settings" className="btn btn-square btn-ghost" aria-label="Settings">
                <IconSettings className="size-5" />
              </Link>
              <button
                className="btn btn-square btn-ghost"
                disabled={disconnectingLinear}
                type="button"
                aria-label="Disconnect Linear"
                onClick={() => void disconnectLinear()}>
                {disconnectingLinear ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <IconLogout className="size-5" />
                )}
              </button>
            </>
          ) : null}
          <label className="swap swap-rotate btn btn-square btn-ghost">
            <input
              aria-label="Toggle theme"
              checked={theme.theme === 'night'}
              type="checkbox"
              onChange={event =>
                void setTheme(
                  event.currentTarget.checked
                    ? { theme: 'night', appearance: 'dark' }
                    : { theme: 'winter', appearance: 'light' },
                )
              }
            />
            <IconSun className="swap-off size-5" />
            <IconMoon className="swap-on size-5" />
          </label>
        </div>
      </div>

      <div className="min-h-0 overflow-x-hidden overflow-y-auto p-6">
        <Outlet />
      </div>

      <AppToaster />
    </main>
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
