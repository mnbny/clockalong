import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

import { AppHeader } from '../components/AppHeader'
import { appToast, AppToaster } from '../components/AppToaster'
import { useDevTools } from '../hooks/useDevTools'
import { appUpdates } from '../services/tauri/appUpdates'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useDevTools()

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

  return (
    <main className="bg-base-100 text-base-content grid h-dvh w-dvw grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <AppHeader />

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
