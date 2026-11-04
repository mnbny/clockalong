import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { AppHeader } from '../components/AppHeader'
import { AppToaster } from '../components/AppToaster'
import { TelegramNotificationFeed } from '../components/TelegramNotificationFeed'
import { useAppUpdates } from '../hooks/useAppUpdates'
import { useDevTools } from '../hooks/useDevTools'
import { useMcpServerBridge } from '../hooks/useMcpServerBridge'
import { useMenuBar } from '../hooks/useMenuBar'
import { useTelegramNotificationSnooze } from '../hooks/useTelegramNotificationSnooze'
import { app } from '../services/tauri/app-client'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const notifications = useTelegramNotificationSnooze()
  useDevTools()
  useAppUpdates()
  useMcpServerBridge()
  useMenuBar()

  useEffect(() => {
    void app.showWindow().catch(error => console.warn('Could not show app window:', error))
  }, [])

  return (
    <main className="bg-base-100 text-base-content grid h-dvh w-dvw grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <AppHeader />

      <div className="scrollbar-hidden min-h-0 overflow-x-hidden overflow-y-auto p-6">
        <Outlet />
      </div>

      <AppToaster />
      {notifications.visible && <TelegramNotificationFeed onSnooze={notifications.snooze} />}
    </main>
  )
}
