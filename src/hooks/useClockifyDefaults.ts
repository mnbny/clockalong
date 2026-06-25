import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { clockifyProjectOptionsQueryKey, getClockifyProjectOptions } from '../services/clockify/projects'
import { useStorage } from '../services/storage/useStorage'
import { useAppAuth } from './useAppAuth'
import { useAppInit } from './useAppInit'

export function useClockifyDefaults() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const [clockifyDefaultProject, setClockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const enabled =
    !appInitializationState.value.appInitializing &&
    !authState.loading &&
    authState.value.linearAuthenticated &&
    authState.value.clockifyAuthenticated

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
