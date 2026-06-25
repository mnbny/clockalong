import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useAppAuth } from '../hooks/useAppAuth'
import { useAppInit } from '../hooks/useAppInit'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (authState.value.linearAuthenticated && authState.value.clockifyAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
