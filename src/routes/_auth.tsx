import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useAppInit } from '../hooks/useAppInit'
import { useAppAuth } from '../hooks/useAppAuth'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (isClinearAuthenticated(authState.value)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
