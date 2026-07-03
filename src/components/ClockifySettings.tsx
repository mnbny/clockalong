import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import {
  type ClockifyEntrySyncDaysOption,
  clockifyEntrySyncDaysOptions,
  type ClockifyEntrySyncIntervalOption,
  clockifyEntrySyncIntervalOptions,
  getClockifyEntrySyncDaysLabel,
  getClockifyEntrySyncIntervalLabel,
} from '../services/clockify/sync-settings'
import { useStorage } from '../services/storage/useStorage'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

export function ClockifySettings() {
  const [clockifyBillable, setClockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject, setClockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyEntrySyncDays, setClockifyEntrySyncDays] = useStorage('clockifyEntrySyncDays')
  const [clockifyEntrySyncInterval, setClockifyEntrySyncInterval] = useStorage('clockifyEntrySyncInterval')
  const clockifyUserQuery = useQuery({
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const clockifyWorkspacesQuery = useQuery({
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const selectedClockifyWorkspace = useMemo(() => {
    const user = clockifyUserQuery.data
    const workspaces = clockifyWorkspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user?.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user?.defaultWorkspace) ??
      workspaces[0]
    )
  }, [clockifyUserQuery.data, clockifyWorkspacesQuery.data])
  const clockifyProjectsQuery = useQuery({
    queryKey: queryKeys.clockify.projects({
      params: { workspaceId: selectedClockifyWorkspace?.id },
    }),
    queryFn: () =>
      clockify.getProjects({
        params: { workspaceId: selectedClockifyWorkspace!.id! },
        queries: {
          archived: false,
          page: 1,
          'page-size': 100,
          'sort-column': 'NAME',
          'sort-order': 'ASCENDING',
        },
      }),
    enabled: Boolean(selectedClockifyWorkspace?.id),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const clockifyProjectOptions = useMemo(() => {
    if (!selectedClockifyWorkspace?.id) {
      return []
    }

    const workspaceId = selectedClockifyWorkspace.id

    return (clockifyProjectsQuery.data ?? []).flatMap(project => {
      if (!project.id || !project.name) {
        return []
      }

      return {
        projectId: project.id,
        projectName: project.name,
        workspaceId,
        workspaceName: selectedClockifyWorkspace.name ?? 'Clockify workspace',
      }
    })
  }, [clockifyProjectsQuery.data, selectedClockifyWorkspace])
  const selectedClockifyProjectValue = clockifyDefaultProject
    ? `${clockifyDefaultProject.workspaceId}:${clockifyDefaultProject.projectId}`
    : ''
  const selectedClockifyProjectLoaded = clockifyProjectOptions.some(
    project => `${project.workspaceId}:${project.projectId}` === selectedClockifyProjectValue,
  )

  useEffect(() => {
    const firstProject = clockifyProjectOptions[0]

    if (!firstProject || clockifyDefaultProject) {
      return
    }

    void setClockifyDefaultProject(firstProject)
  }, [clockifyDefaultProject, clockifyProjectOptions, setClockifyDefaultProject])

  return (
    <SettingsSection title="Clockify">
      <SettingsRow label="Sync: Range" description="How many recent Clockify entries to keep synced.">
        <select
          aria-label="Clockify entry sync range"
          className="select select-primary w-full max-w-56"
          value={clockifyEntrySyncDays}
          onChange={event =>
            void setClockifyEntrySyncDays(Number(event.currentTarget.value) as ClockifyEntrySyncDaysOption)
          }>
          {clockifyEntrySyncDaysOptions.map(option => (
            <option key={option} value={option}>
              {getClockifyEntrySyncDaysLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Sync: Interval" description="How often Clockify entries refresh.">
        <select
          aria-label="Clockify entry sync interval"
          className="select select-primary w-full max-w-56"
          value={clockifyEntrySyncInterval}
          onChange={event =>
            void setClockifyEntrySyncInterval(event.currentTarget.value as ClockifyEntrySyncIntervalOption)
          }>
          {clockifyEntrySyncIntervalOptions.map(option => (
            <option key={option} value={option}>
              {getClockifyEntrySyncIntervalLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow
        label="Project"
        description="Clockify project used for new timers.">
        <div className="flex w-full max-w-sm items-center gap-2">
          <select
            aria-label="Default Clockify project"
            className="select select-primary min-w-0 flex-1"
            disabled={
              clockifyUserQuery.isLoading ||
              clockifyWorkspacesQuery.isLoading ||
              clockifyProjectsQuery.isLoading ||
              clockifyUserQuery.isError ||
              clockifyWorkspacesQuery.isError ||
              clockifyProjectsQuery.isError ||
              !clockifyProjectOptions.length
            }
            value={selectedClockifyProjectValue}
            onChange={event => {
              const selectedProject = clockifyProjectOptions.find(
                project => `${project.workspaceId}:${project.projectId}` === event.currentTarget.value,
              )

              if (selectedProject) {
                void setClockifyDefaultProject(selectedProject)
              }
            }}>
            {!selectedClockifyProjectValue ? <option value="">No projects loaded</option> : null}
            {selectedClockifyProjectValue && !selectedClockifyProjectLoaded && clockifyDefaultProject ? (
              <option value={selectedClockifyProjectValue}>
                {`${clockifyDefaultProject.workspaceName} / ${clockifyDefaultProject.projectName}`}
              </option>
            ) : null}
            {clockifyProjectOptions.map(project => (
              <option
                key={`${project.workspaceId}:${project.projectId}`}
                value={`${project.workspaceId}:${project.projectId}`}>
                {`${project.workspaceName} / ${project.projectName}`}
              </option>
            ))}
          </select>
          {clockifyUserQuery.isFetching || clockifyWorkspacesQuery.isFetching || clockifyProjectsQuery.isFetching ? (
            <span className="loading loading-spinner loading-xs" />
          ) : null}
        </div>
      </SettingsRow>

      <SettingsRow label="Billable by default" description="Start new timers as billable.">
        <input
          aria-label="Billable by default"
          checked={clockifyBillable}
          className="toggle toggle-primary"
          type="checkbox"
          onChange={event => void setClockifyBillable(event.currentTarget.checked)}
        />
      </SettingsRow>
    </SettingsSection>
  )
}
