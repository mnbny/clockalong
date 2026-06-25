import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useAppAuth } from '../hooks/useAppAuth'
import { useAppInit } from '../hooks/useAppInit'
import { useClockifyDefaults } from '../hooks/useClockifyDefaults'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const authenticated =
    !appInitializationState.value.appInitializing && !authState.loading && isClinearAuthenticated(authState.value)

  useClockifyDefaults()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (!authenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}
