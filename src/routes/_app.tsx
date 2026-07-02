import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useAppAuth } from '../hooks/useAppAuth'
import { useAppInit } from '../hooks/useAppInit'
import { useClockifyDefaults } from '../hooks/useClockifyDefaults'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const authenticated =
    !appInitializationState.value.appInitializing && !authState.loading && authState.value.clockifyAuthenticated

  useClockifyDefaults()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (!authenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}
