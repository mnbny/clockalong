import { type RestEndpointMethodTypes } from '@octokit/rest'
import { IconBrandGithub, IconCheck, IconChevronDown, IconRestore, IconSearch, IconX } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { queryKeys } from '../lib/query-client'
import { createGithubClient } from '../services/github/client'
import {
  defaultGithubIssueDescriptionTemplate,
  defaultGithubIssueDescriptionTemplateFallback,
  defaultGithubPullRequestDescriptionTemplate,
  defaultGithubPullRequestDescriptionTemplateFallback,
  formatGithubIssueDescriptionTemplate,
  formatGithubPullRequestDescriptionTemplate,
  getUnknownGithubIssueDescriptionTemplateTokens,
  getUnknownGithubPullRequestDescriptionTemplateTokens,
  type GithubDescriptionTemplateToken,
  type GithubDescriptionTemplateTokenGroup,
  githubIssueDescriptionTemplateTokenGroups,
  githubPullRequestDescriptionTemplateTokenGroups,
  sampleGithubIssueDescriptionTemplateValues,
  sampleGithubPullRequestDescriptionTemplateValues,
} from '../services/github/description-template'
import {
  getGithubWorkItemSyncIntervalLabel,
  type GithubWorkItemSyncIntervalOption,
  githubWorkItemSyncIntervalOptions,
} from '../services/github/sync-settings'
import {
  defaultGithubWorkItemSyncLimit,
  type GithubSelectedRepository,
  maxGithubWorkItemSyncLimit,
} from '../services/storage/config'
import { useStorage } from '../services/storage/useStorage'
import { cx } from '../utils/cx'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { GitHubAuthDialog } from './GitHubAuthDialog'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

type GithubRepositoryResponse = RestEndpointMethodTypes['repos']['listForAuthenticatedUser']['response']['data'][number]

export function GitHubSettings() {
  const authState = useAppAuth()
  const githubAuthenticated = authState.value.githubAuthenticated && !authState.loading

  if (!githubAuthenticated) {
    return <DisconnectedGitHubSettings authLoading={authState.loading} />
  }

  return <ConnectedGitHubSettings />
}

function DisconnectedGitHubSettings({ authLoading }: { authLoading: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [connecting, setConnecting] = useState(false)

  return (
    <SettingsSection title="GitHub">
      <SettingsRow label="GitHub account" description="Connect GitHub to sync issues and pull requests.">
        <button
          className="btn btn-primary"
          disabled={authLoading || connecting}
          type="button"
          onClick={() => dialogRef.current?.showModal()}>
          {connecting ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <IconBrandGithub className="size-5" />
          )}
          Connect GitHub
        </button>
      </SettingsRow>

      <GitHubAuthDialog ref={dialogRef} onPendingChange={setConnecting} />
    </SettingsSection>
  )
}

function ConnectedGitHubSettings() {
  const [githubSelectedRepositories, setGithubSelectedRepositories] = useStorage('githubSelectedRepositories')
  const [githubVisibleWorkItemTypes, setGithubVisibleWorkItemTypes] = useStorage('githubVisibleWorkItemTypes')
  const [githubWorkItemSyncLimit, setGithubWorkItemSyncLimit] = useStorage('githubWorkItemSyncLimit')
  const [githubWorkItemSyncInterval, setGithubWorkItemSyncInterval] = useStorage('githubWorkItemSyncInterval')
  const [githubShowClosedWorkItems, setGithubShowClosedWorkItems] = useStorage('githubShowClosedWorkItems')
  const [githubIssueDescriptionTemplate, setGithubIssueDescriptionTemplate, resetGithubIssueDescriptionTemplate] =
    useStorage('githubIssueDescriptionTemplate')
  const [
    githubIssueDescriptionTemplateFallback,
    setGithubIssueDescriptionTemplateFallback,
    resetGithubIssueDescriptionTemplateFallback,
  ] = useStorage('githubIssueDescriptionTemplateFallback')
  const [
    githubPullRequestDescriptionTemplate,
    setGithubPullRequestDescriptionTemplate,
    resetGithubPullRequestDescriptionTemplate,
  ] = useStorage('githubPullRequestDescriptionTemplate')
  const [
    githubPullRequestDescriptionTemplateFallback,
    setGithubPullRequestDescriptionTemplateFallback,
    resetGithubPullRequestDescriptionTemplateFallback,
  ] = useStorage('githubPullRequestDescriptionTemplateFallback')
  const [descriptionTemplateTab, setDescriptionTemplateTab] = useState<'issues' | 'pullRequests'>('issues')
  const repositoriesQuery = useQuery({
    queryKey: queryKeys.github.repositories,
    queryFn: fetchGithubRepositoryCandidates,
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const candidateRepositories = useMemo(
    () => (repositoriesQuery.data ?? []).flatMap(toGithubRepositoryOption).sort(compareGithubRepositories),
    [repositoriesQuery.data],
  )
  return (
    <SettingsSection allowOverflow title="GitHub">
      <SettingsRow label="Sync: Active" description="Repositories included in GitHub sync.">
        <div className="grid w-full gap-3">
          <div className="flex min-h-6 items-center">
            {repositoriesQuery.isFetching ? <span className="loading loading-spinner loading-xs" /> : null}
          </div>

          {repositoriesQuery.isError ? (
            <div className="alert alert-error max-w-md py-2 text-sm">
              Could not load GitHub repositories: {getErrorMessage(repositoriesQuery.error)}
            </div>
          ) : null}

          <GithubRepositoryPicker
            candidateRepositories={candidateRepositories}
            disabled={repositoriesQuery.isFetching && !candidateRepositories.length}
            selectedRepositories={githubSelectedRepositories}
            onChange={repositories => setGithubSelectedRepositories(repositories)}
          />

          {repositoriesQuery.isSuccess && !candidateRepositories.length ? (
            <div className="text-base-content/60 text-sm">No repositories available.</div>
          ) : null}
        </div>
      </SettingsRow>

      <SettingsRow label="Sync: Types" description="GitHub item types included in sync.">
        <fieldset className="flex flex-wrap items-center gap-4" aria-label="GitHub work item types">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              checked={githubVisibleWorkItemTypes.pullRequests}
              className="checkbox checkbox-primary checkbox-sm"
              type="checkbox"
              onChange={event =>
                void setGithubVisibleWorkItemTypes({
                  ...githubVisibleWorkItemTypes,
                  pullRequests: event.currentTarget.checked,
                })
              }
            />
            <span className="text-sm leading-6">Pull requests</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              checked={githubVisibleWorkItemTypes.issues}
              className="checkbox checkbox-primary checkbox-sm"
              type="checkbox"
              onChange={event =>
                void setGithubVisibleWorkItemTypes({
                  ...githubVisibleWorkItemTypes,
                  issues: event.currentTarget.checked,
                })
              }
            />
            <span className="text-sm leading-6">Issues</span>
          </label>
        </fieldset>
      </SettingsRow>

      <SettingsRow label="Work item fetch limit" description="Number of GitHub items to sync per repository.">
        <label className="input input-primary w-full max-w-32">
          <input
            aria-label="GitHub work item fetch limit"
            className="min-w-0 grow text-sm"
            max={maxGithubWorkItemSyncLimit}
            min={1}
            step={1}
            type="number"
            value={githubWorkItemSyncLimit}
            onChange={event =>
              void setGithubWorkItemSyncLimit(
                normalizePositiveInteger(event.currentTarget.value, defaultGithubWorkItemSyncLimit),
              )
            }
          />
        </label>
      </SettingsRow>

      <SettingsRow label="Sync: Interval" description="How often GitHub work items refresh.">
        <select
          aria-label="GitHub work item sync interval"
          className="select select-primary w-full max-w-56"
          value={githubWorkItemSyncInterval}
          onChange={event =>
            void setGithubWorkItemSyncInterval(event.currentTarget.value as GithubWorkItemSyncIntervalOption)
          }>
          {githubWorkItemSyncIntervalOptions.map(option => (
            <option key={option} value={option}>
              {getGithubWorkItemSyncIntervalLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Dashboard: Closed Items" description="Show closed pull requests on the dashboard.">
        <input
          aria-label="Show closed GitHub work items"
          checked={githubShowClosedWorkItems}
          className="toggle toggle-primary"
          type="checkbox"
          onChange={event => void setGithubShowClosedWorkItems(event.currentTarget.checked)}
        />
      </SettingsRow>

      <SettingsRow label="Clockify: Template" description="Clockify description format for GitHub timers.">
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="tabs tabs-box w-fit">
            <button
              className={cx('tab', descriptionTemplateTab === 'issues' && 'tab-active')}
              type="button"
              onClick={() => setDescriptionTemplateTab('issues')}>
              Issues
            </button>
            <button
              className={cx('tab', descriptionTemplateTab === 'pullRequests' && 'tab-active')}
              type="button"
              onClick={() => setDescriptionTemplateTab('pullRequests')}>
              Pull requests
            </button>
          </div>

          {descriptionTemplateTab === 'issues' ? (
            <GithubDescriptionTemplateEditor
              defaultFallback={defaultGithubIssueDescriptionTemplateFallback}
              defaultValue={defaultGithubIssueDescriptionTemplate}
              fallback={githubIssueDescriptionTemplateFallback}
              formatPreview={(template, values, fallback) =>
                formatGithubIssueDescriptionTemplate(template, values, { fallback })
              }
              getUnknownTokens={getUnknownGithubIssueDescriptionTemplateTokens}
              sampleValues={sampleGithubIssueDescriptionTemplateValues}
              saveLabel="GitHub issue description format"
              tokenGroups={githubIssueDescriptionTemplateTokenGroups}
              value={githubIssueDescriptionTemplate}
              onReset={async () => {
                await Promise.all([
                  resetGithubIssueDescriptionTemplate(),
                  resetGithubIssueDescriptionTemplateFallback(),
                ])
              }}
              onSave={setGithubIssueDescriptionTemplate}
              onSaveFallback={setGithubIssueDescriptionTemplateFallback}
            />
          ) : (
            <GithubDescriptionTemplateEditor
              defaultFallback={defaultGithubPullRequestDescriptionTemplateFallback}
              defaultValue={defaultGithubPullRequestDescriptionTemplate}
              fallback={githubPullRequestDescriptionTemplateFallback}
              formatPreview={(template, values, fallback) =>
                formatGithubPullRequestDescriptionTemplate(template, values, { fallback })
              }
              getUnknownTokens={getUnknownGithubPullRequestDescriptionTemplateTokens}
              sampleValues={sampleGithubPullRequestDescriptionTemplateValues}
              saveLabel="GitHub pull request description format"
              tokenGroups={githubPullRequestDescriptionTemplateTokenGroups}
              value={githubPullRequestDescriptionTemplate}
              onReset={async () => {
                await Promise.all([
                  resetGithubPullRequestDescriptionTemplate(),
                  resetGithubPullRequestDescriptionTemplateFallback(),
                ])
              }}
              onSave={setGithubPullRequestDescriptionTemplate}
              onSaveFallback={setGithubPullRequestDescriptionTemplateFallback}
            />
          )}
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}

type GithubRepositoryPickerProps = {
  candidateRepositories: GithubSelectedRepository[]
  disabled: boolean
  selectedRepositories: GithubSelectedRepository[]
  onChange: (repositories: GithubSelectedRepository[]) => Promise<void>
}

function GithubRepositoryPicker({
  candidateRepositories,
  disabled,
  onChange,
  selectedRepositories,
}: GithubRepositoryPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [draftSelectedRepositories, setDraftSelectedRepositories] = useState(selectedRepositories)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const draftSelectedFullNames = useMemo(
    () => new Set(draftSelectedRepositories.map(repository => repository.fullName)),
    [draftSelectedRepositories],
  )
  const visibleRepositories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return candidateRepositories
      .filter(repository => !normalizedSearch || repository.fullName.toLowerCase().includes(normalizedSearch))
      .sort(
        (left, right) =>
          Number(draftSelectedFullNames.has(right.fullName)) - Number(draftSelectedFullNames.has(left.fullName)) ||
          compareGithubRepositories(left, right),
      )
  }, [candidateRepositories, draftSelectedFullNames, search])
  const selectionChanged = !areGithubRepositorySelectionsEqual(draftSelectedRepositories, selectedRepositories)

  useEffect(() => {
    if (!open) {
      setDraftSelectedRepositories(selectedRepositories)
    }
  }, [open, selectedRepositories])

  useEffect(() => {
    if (open) {
      searchInputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setDraftSelectedRepositories(selectedRepositories)
        setSearch('')
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDraftSelectedRepositories(selectedRepositories)
        setSearch('')
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, selectedRepositories])

  const openPicker = () => {
    setDraftSelectedRepositories(selectedRepositories)
    setSearch('')
    setOpen(true)
  }

  const closePicker = () => {
    setDraftSelectedRepositories(selectedRepositories)
    setSearch('')
    setOpen(false)
  }

  const toggleRepository = (repository: GithubSelectedRepository) => {
    setDraftSelectedRepositories(currentRepositories => {
      if (currentRepositories.some(currentRepository => currentRepository.fullName === repository.fullName)) {
        return currentRepositories.filter(currentRepository => currentRepository.fullName !== repository.fullName)
      }

      return [...currentRepositories, repository].sort(compareGithubRepositories)
    })
  }

  const saveSelection = async () => {
    setSaving(true)

    try {
      await onChange([...draftSelectedRepositories].sort(compareGithubRepositories))
      setSearch('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={pickerRef} className="relative w-full max-w-96">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="input input-primary flex w-full cursor-pointer items-center justify-between gap-2 text-left text-sm"
        disabled={disabled || saving}
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}>
        <span className={cx('truncate', !selectedRepositories.length && 'text-base-content/60')}>
          {getGithubRepositorySelectionLabel(selectedRepositories.length)}
        </span>
        <IconChevronDown className={cx('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          aria-label="Select GitHub repositories"
          className="border-base-content/10 bg-base-100 rounded-box absolute top-full left-0 z-50 mt-2 w-full border p-3 shadow-sm"
          role="dialog">
          <div className="input input-primary input-sm w-full">
            <IconSearch className="size-4 opacity-60" />
            <input
              ref={searchInputRef}
              aria-label="Search GitHub repositories"
              placeholder="Search repositories"
              type="search"
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
            />
            {search ? (
              <button
                aria-label="Clear repository search"
                className="btn btn-ghost btn-xs btn-circle"
                type="button"
                onClick={() => setSearch('')}>
                <IconX className="size-3" />
              </button>
            ) : null}
          </div>

          <div className="border-base-content/10 mt-3 max-h-64 overflow-y-auto border-y py-1">
            {visibleRepositories.length ? (
              visibleRepositories.map(repository => (
                <label
                  key={repository.fullName}
                  className="hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-3 px-2 py-2"
                  title={repository.fullName}>
                  <input
                    aria-label={repository.fullName}
                    checked={draftSelectedFullNames.has(repository.fullName)}
                    className="checkbox checkbox-primary checkbox-sm"
                    type="checkbox"
                    onChange={() => toggleRepository(repository)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{repository.name}</span>
                    <span className="text-base-content/60 block truncate text-xs">{repository.fullName}</span>
                  </span>
                </label>
              ))
            ) : (
              <div className="text-base-content/60 px-2 py-4 text-center text-sm">
                {candidateRepositories.length ? 'No repositories match your search.' : 'No repositories available.'}
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button className="btn btn-ghost btn-sm" disabled={saving} type="button" onClick={closePicker}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!selectionChanged || saving}
              type="button"
              onClick={() => void saveSelection()}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : <IconCheck className="size-4" />}
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type GithubDescriptionTemplateEditorProps = {
  defaultFallback: string
  defaultValue: string
  fallback: string
  formatPreview: (
    template: string,
    values: Record<string, string | number | null | undefined>,
    fallback: string,
  ) => string
  getUnknownTokens: (template: string) => string[]
  sampleValues: Record<string, string | number | null | undefined>
  saveLabel: string
  tokenGroups: GithubDescriptionTemplateTokenGroup<GithubDescriptionTemplateToken>[]
  value: string
  onReset: () => Promise<void>
  onSave: (value: string) => Promise<void>
  onSaveFallback: (value: string) => Promise<void>
}

function GithubDescriptionTemplateEditor({
  defaultFallback,
  defaultValue,
  fallback,
  formatPreview,
  getUnknownTokens,
  sampleValues,
  saveLabel,
  tokenGroups,
  value,
  onReset,
  onSave,
  onSaveFallback,
}: GithubDescriptionTemplateEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(value)
  const [fallbackDraft, setFallbackDraft] = useState(fallback)
  const normalizedDraft = draft.trim()
  const normalizedFallbackDraft = fallbackDraft.trim()
  const unknownTokens = useMemo(() => getUnknownTokens(draft), [draft, getUnknownTokens])
  const preview = useMemo(
    () => formatPreview(draft || defaultValue, sampleValues, normalizedFallbackDraft || defaultFallback),
    [defaultFallback, defaultValue, draft, formatPreview, normalizedFallbackDraft, sampleValues],
  )
  const invalid = !normalizedDraft || unknownTokens.length > 0
  const changed = draft !== value || fallbackDraft !== fallback

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    setFallbackDraft(fallback)
  }, [fallback])

  const insertToken = (token: GithubDescriptionTemplateToken) => {
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
      appToast.success(`${saveLabel} saved`)
    } catch (error) {
      appToast.error('Could not save description format', {
        description: getErrorMessage(error),
      })
    }
  }

  const resetTemplate = async () => {
    try {
      await onReset()
      setDraft(defaultValue)
      setFallbackDraft(defaultFallback)
      appToast.success(`${saveLabel} reset`)
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
          aria-label="GitHub entry description format"
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
          aria-label="GitHub entry description fallback"
          className="input input-primary input-sm font-mono text-sm"
          type="text"
          value={fallbackDraft}
          onChange={event => setFallbackDraft(event.currentTarget.value)}
        />
        <p className="fieldset-label">Used when a GitHub value is missing or empty.</p>
      </fieldset>

      <div className="bg-base-200 rounded-box min-w-0 p-3">
        <div className="text-base-content/60 text-xs leading-5 font-medium">Preview</div>
        <div className="overflow-wrap-anywhere font-mono text-sm leading-6 whitespace-pre-wrap">
          {preview || defaultValue}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {tokenGroups.map(group => (
          <div key={group.label} className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <div className="text-base-content/60 text-xs leading-5 font-medium">{group.label}</div>
              {group.label === 'Tracking' ? (
                <div className="text-base-content/50 text-xs leading-5">
                  Recommended so Clockalong can match Clockify entries back to source items.
                </div>
              ) : null}
            </div>
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

async function fetchGithubRepositoryCandidates() {
  const github = await createGithubClient()

  return github.paginate(github.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
  })
}

function toGithubRepositoryOption(repository: GithubRepositoryResponse): GithubSelectedRepository[] {
  const owner = repository.owner?.login
  const fullName = repository.full_name
  const name = repository.name
  const url = repository.html_url

  if (!repository.id || !owner || !fullName || !name || !url) {
    return []
  }

  return [
    {
      fullName,
      id: repository.id,
      name,
      owner,
      private: repository.private,
      url,
    },
  ]
}

function compareGithubRepositories(left: GithubSelectedRepository, right: GithubSelectedRepository) {
  return left.fullName.localeCompare(right.fullName)
}

function areGithubRepositorySelectionsEqual(left: GithubSelectedRepository[], right: GithubSelectedRepository[]) {
  const leftFullNames = left.map(repository => repository.fullName).sort()
  const rightFullNames = right.map(repository => repository.fullName).sort()

  return (
    leftFullNames.length === rightFullNames.length &&
    leftFullNames.every((name, index) => name === rightFullNames[index])
  )
}

function getGithubRepositorySelectionLabel(count: number) {
  if (!count) {
    return 'Select repositories'
  }

  return `${count} ${count === 1 ? 'repository' : 'repositories'} selected`
}

function normalizePositiveInteger(value: string, fallback: number) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(maxGithubWorkItemSyncLimit, Math.max(1, Math.floor(parsedValue)))
}
