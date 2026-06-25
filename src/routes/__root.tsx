import { useHotkeys } from '@mantine/hooks'
import { IconLogout, IconMoon, IconSettings, IconSun } from '@tabler/icons-react'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect } from 'react'

import { appToast, AppToaster } from '../components/AppToaster'
import { MoonBunnyLogo } from '../components/MoonBunnyLogo'
import { useDevTools } from '../hooks/useDevTools'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { useStorage } from '../services/storage/useStorage'
import { appUpdates } from '../services/tauri/appUpdates'
import { clinearAuth, isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useDevTools()
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
    if (!isTauri()) {
      return
    }

    let active = true
    let notifiedVersion: string | null = null

    const checkForUpdates = async () => {
      try {
        const update = await appUpdates.check()

        if (!active || !update || notifiedVersion === update.version) {
          return
        }

        notifiedVersion = update.version
        appToast.info(`Clinear ${update.version} is available`, {
          action: {
            label: 'Install',
            onClick: async () => {
              try {
                await appUpdates.install()
                appToast.success('Update installed', {
                  action: {
                    label: 'Restart',
                    onClick: appUpdates.relaunch,
                  },
                  description: 'Restart Clinear to finish.',
                })
              } catch (error) {
                appToast.error('Could not install update', {
                  description: getErrorMessage(error),
                })
              }
            },
          },
          description: <Link to="/settings">Open Settings</Link>,
        })
      } catch (error) {
        console.info('[app updates] update check failed', error)
      }
    }

    const initialCheck = window.setTimeout(() => {
      void checkForUpdates()
    }, 10_000)
    const interval = window.setInterval(
      () => {
        void checkForUpdates()
      },
      6 * 60 * 60 * 1000,
    )

    return () => {
      active = false
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
    }
  }, [])

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
    <main className="bg-base-100 text-base-content grid h-dvh w-dvw grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
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
