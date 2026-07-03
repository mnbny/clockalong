import { createFileRoute, Outlet } from '@tanstack/react-router'

import { useAppInit } from '../hooks/useAppInit'

export const Route = createFileRoute('/_auth')({
  component: AuthLayout,
})

function AuthLayout() {
  const appInitializationState = useAppInit()

  if (appInitializationState.value.appInitializing) {
    return null
  }

  return <Outlet />
}
