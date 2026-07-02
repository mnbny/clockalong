import { IconCheck, IconRestore } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import {
  type ClockifyDescriptionTemplateToken,
  clockifyDescriptionTemplateTokenGroups,
  defaultClockifyDescriptionTemplate,
  defaultClockifyDescriptionTemplateFallback,
  formatClockifyDescriptionTemplate,
  getUnknownClockifyDescriptionTemplateTokens,
  sampleClockifyDescriptionTemplateValues,
} from '../services/clockify/description-template'
import {
  type ClockifyEntrySyncDaysOption,
  clockifyEntrySyncDaysOptions,
  type ClockifyEntrySyncIntervalOption,
  clockifyEntrySyncIntervalOptions,
  getClockifyEntrySyncDaysLabel,
  getClockifyEntrySyncIntervalLabel,
} from '../services/clockify/sync-settings'
import { useStorage } from '../services/storage/useStorage'
import { cx } from '../utils/cx'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

export function ClockifySettings() {
  const [clockifyBillable, setClockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject, setClockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [clockifyEntrySyncDays, setClockifyEntrySyncDays] = useStorage('clockifyEntrySyncDays')
  const [clockifyEntrySyncInterval, setClockifyEntrySyncInterval] = useStorage('clockifyEntrySyncInterval')
  const [clockifyDescriptionTemplate, setClockifyDescriptionTemplate, resetClockifyDescriptionTemplate] =
    useStorage('clockifyDescriptionTemplate')
  const [
    clockifyDescriptionTemplateFallback,
    setClockifyDescriptionTemplateFallback,
    resetClockifyDescriptionTemplateFallback,
  ] = useStorage('clockifyDescriptionTemplateFallback')
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
      <SettingsRow
        label="Default project"
        description="Project used when creating new Clockify time entries from Linear issues.">
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

      <SettingsRow label="Billable by default" description="Mark new Clockify time entries as billable unless changed.">
        <input
          aria-label="Billable by default"
          checked={clockifyBillable}
          className="toggle toggle-primary"
          type="checkbox"
          onChange={event => void setClockifyBillable(event.currentTarget.checked)}
        />
      </SettingsRow>

      <SettingsRow label="Entry sync range" description="Number of recent Clockify entry days to sync.">
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

      <SettingsRow label="Entry sync interval" description="How often recent Clockify entries refresh.">
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

      <SettingsRow label="Entry description" description="Format used when creating time entries from Linear issues.">
        <ClockifyDescriptionTemplateEditor
          fallback={clockifyDescriptionTemplateFallback}
          value={clockifyDescriptionTemplate}
          onReset={async () => {
            await Promise.all([resetClockifyDescriptionTemplate(), resetClockifyDescriptionTemplateFallback()])
          }}
          onSave={setClockifyDescriptionTemplate}
          onSaveFallback={setClockifyDescriptionTemplateFallback}
        />
      </SettingsRow>
    </SettingsSection>
  )
}

type ClockifyDescriptionTemplateEditorProps = {
  fallback: string
  value: string
  onReset: () => Promise<void>
  onSave: (value: string) => Promise<void>
  onSaveFallback: (value: string) => Promise<void>
}

function ClockifyDescriptionTemplateEditor({
  fallback,
  value,
  onReset,
  onSave,
  onSaveFallback,
}: ClockifyDescriptionTemplateEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(value)
  const [fallbackDraft, setFallbackDraft] = useState(fallback)
  const normalizedDraft = draft.trim()
  const normalizedFallbackDraft = fallbackDraft.trim()
  const unknownTokens = useMemo(() => getUnknownClockifyDescriptionTemplateTokens(draft), [draft])
  const preview = useMemo(
    () =>
      formatClockifyDescriptionTemplate(
        draft || defaultClockifyDescriptionTemplate,
        sampleClockifyDescriptionTemplateValues,
        { fallback: normalizedFallbackDraft || defaultClockifyDescriptionTemplateFallback },
      ),
    [draft, normalizedFallbackDraft],
  )
  const invalid = !normalizedDraft || unknownTokens.length > 0
  const changed = draft !== value || fallbackDraft !== fallback

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    setFallbackDraft(fallback)
  }, [fallback])

  const insertToken = (token: ClockifyDescriptionTemplateToken) => {
    const input = inputRef.current
    const tokenText = `{${token}}`

    if (!input) {
      setDraft(current => `${current}${tokenText}`)
      return
    }

    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? draft.length
    const nextDraft = `${draft.slice(0, start)}${tokenText}${draft.slice(end)}`

    setDraft(nextDraft)
    window.requestAnimationFrame(() => {
      input.focus()
      const nextCursor = start + tokenText.length
      input.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const saveTemplate = async () => {
    if (invalid) {
      return
    }

    try {
      await Promise.all([onSave(normalizedDraft), onSaveFallback(normalizedFallbackDraft)])
      appToast.success('Clockify description format saved')
    } catch (error) {
      appToast.error('Could not save description format', {
        description: getErrorMessage(error),
      })
    }
  }

  const resetTemplate = async () => {
    try {
      await onReset()
      setDraft(defaultClockifyDescriptionTemplate)
      setFallbackDraft(defaultClockifyDescriptionTemplateFallback)
      appToast.success('Clockify description format reset')
    } catch (error) {
      appToast.error('Could not reset description format', {
        description: getErrorMessage(error),
      })
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Format</legend>
        <textarea
          ref={inputRef}
          aria-label="Clockify entry description format"
          className={cx(
            'textarea textarea-primary min-h-20 w-full resize-y font-mono text-sm',
            invalid && 'textarea-error',
          )}
          value={draft}
          onChange={event => setDraft(event.currentTarget.value)}
        />

        {unknownTokens.length > 0 ? (
          <p className="fieldset-label text-error">
            Unknown {unknownTokens.length === 1 ? 'variable' : 'variables'}:{' '}
            {unknownTokens.map(token => `{${token}}`).join(', ')}
          </p>
        ) : null}

        {!normalizedDraft ? <p className="fieldset-label text-error">Description format is required.</p> : null}
      </fieldset>

      <fieldset className="fieldset w-full max-w-xs">
        <legend className="fieldset-legend">Fallback</legend>
        <input
          aria-label="Clockify entry description fallback"
          className="input input-primary input-sm font-mono text-sm"
          type="text"
          value={fallbackDraft}
          onChange={event => setFallbackDraft(event.currentTarget.value)}
        />
        <p className="fieldset-label">Used when a Linear value is missing or empty.</p>
      </fieldset>

      <div className="bg-base-200 rounded-box min-w-0 p-3">
        <div className="text-base-content/60 text-xs leading-5 font-medium">Preview</div>
        <div className="overflow-wrap-anywhere font-mono text-sm leading-6 whitespace-pre-wrap">
          {preview || defaultClockifyDescriptionTemplate}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {clockifyDescriptionTemplateTokenGroups.map(group => (
          <div key={group.label} className="flex min-w-0 flex-col gap-2">
            <div className="text-base-content/60 text-xs leading-5 font-medium">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.tokens.map(token => (
                <button
                  key={token}
                  className="btn btn-outline btn-xs font-mono"
                  type="button"
                  onClick={() => insertToken(token)}>
                  {`{${token}}`}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => void resetTemplate()}>
          <IconRestore className="size-4" />
          Reset
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={!changed || invalid}
          onClick={() => void saveTemplate()}>
          <IconCheck className="size-4" />
          Save
        </button>
      </div>
    </div>
  )
}
