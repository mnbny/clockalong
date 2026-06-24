import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

import { useTauriAppInitializationState } from '../hooks/useTauriAppInitializationState'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const appInitializationState = useTauriAppInitializationState()
  const authState = useTauriClinearAuthState()

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (!isClinearAuthenticated(authState.value)) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}
