import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useAppInit } from '../hooks/useAppInit'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  const appInitializationState = useAppInit()
  const authState = useTauriClinearAuthState()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (isClinearAuthenticated(authState.value)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
