import { IconBell, IconMoon, IconSearch, IconSettings, IconSun } from '@tabler/icons-react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'

import { AppToaster } from '../components/AppToaster'
import { ClinearLogo } from '../components/ClinearLogo'
import { useDevTools } from '../hooks/useDevTools'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { useStorage } from '../services/storage/useStorage'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useDevTools()
  const [theme, setTheme] = useStorage('theme')
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

  return (
    <main className="bg-base-100 text-base-content grid h-dvh w-dvw grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div
        className="border-base-300 bg-base-200 sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4"
        data-tauri-drag-region>
        <div />

        <h1 className="pointer-events-none flex h-10 min-w-0 items-center gap-3 justify-self-center text-lg leading-none font-semibold">
          <span className="truncate">Clinear</span>
          <ClinearLogo className="size-10 self-center" />
          <span className="truncate">App</span>
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
              <button className="btn btn-square btn-ghost" type="button" aria-label="Settings">
                <IconSettings className="size-5" />
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
