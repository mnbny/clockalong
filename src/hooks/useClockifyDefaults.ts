import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
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

  const userQuery = useQuery({
    enabled,
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const workspacesQuery = useQuery({
    enabled,
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const selectedWorkspace = useMemo(() => {
    const user = userQuery.data
    const workspaces = workspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user?.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user?.defaultWorkspace) ??
      workspaces[0]
    )
  }, [userQuery.data, workspacesQuery.data])
  const projectsQuery = useQuery({
    enabled: enabled && Boolean(selectedWorkspace?.id),
    queryKey: queryKeys.clockify.projects({
      params: { workspaceId: selectedWorkspace?.id },
    }),
    queryFn: () =>
      clockify.getProjects({
        params: { workspaceId: selectedWorkspace!.id! },
        queries: {
          archived: false,
          page: 1,
          'page-size': 100,
          'sort-column': 'NAME',
          'sort-order': 'ASCENDING',
        },
      }),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const firstProject = useMemo(() => {
    if (!selectedWorkspace?.id) {
      return null
    }

    const project = projectsQuery.data?.find(candidate => candidate.id && candidate.name)

    if (!project?.id || !project.name) {
      return null
    }

    return {
      projectId: project.id,
      projectName: project.name,
      workspaceId: selectedWorkspace.id,
      workspaceName: selectedWorkspace.name ?? 'Clockify workspace',
    }
  }, [projectsQuery.data, selectedWorkspace])

  useEffect(() => {
    if (!enabled || !firstProject || clockifyDefaultProject) {
      return
    }

    void setClockifyDefaultProject(firstProject).catch(error => {
      console.warn('[clockify api] Could not initialize default Clockify project:', error)
    })
  }, [clockifyDefaultProject, enabled, firstProject, setClockifyDefaultProject])
}
