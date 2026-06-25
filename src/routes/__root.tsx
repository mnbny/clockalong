import { createRootRoute, Outlet } from '@tanstack/react-router'

import { AppHeader } from '../components/AppHeader'
import { AppToaster } from '../components/AppToaster'
import { useAppUpdates } from '../hooks/useAppUpdates'
import { useDevTools } from '../hooks/useDevTools'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  useDevTools()
  useAppUpdates()

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
