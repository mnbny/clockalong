import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useTauriAppInitializationState } from '../hooks/useTauriAppInitializationState'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { clockifyProjectOptionsQueryKey, getClockifyProjectOptions } from '../services/clockify'
import { useStorage } from '../services/storage/useStorage'
import { isClinearAuthenticated } from '../services/tauri/authClient'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

function AppLayout() {
  const appInitializationState = useTauriAppInitializationState()
  const authState = useTauriClinearAuthState()
  const authenticated =
    !appInitializationState.value.appInitializing && !authState.loading && isClinearAuthenticated(authState.value)

  useClockifyDefaultProjectInitializer({ enabled: authenticated })

  if (appInitializationState.value.appInitializing || authState.loading) {
    return null
  }

  if (!authenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}

function useClockifyDefaultProjectInitializer({ enabled }: { enabled: boolean }) {
  const [clockifyDefaultProject, setClockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const projectsQuery = useQuery({
    enabled,
    queryKey: clockifyProjectOptionsQueryKey,
    queryFn: getClockifyProjectOptions,
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const firstProject = projectsQuery.data?.[0] ?? null

  useEffect(() => {
    if (!enabled || !firstProject || clockifyDefaultProject) {
      return
    }

    void setClockifyDefaultProject(firstProject).catch(error => {
      console.warn('[clockify api] Could not initialize default Clockify project:', error)
    })
  }, [clockifyDefaultProject, enabled, firstProject, setClockifyDefaultProject])
}
