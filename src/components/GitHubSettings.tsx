import { type RestEndpointMethodTypes } from '@octokit/rest'
import { IconBrandGithub, IconCheck, IconRestore } from '@tabler/icons-react'
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
  const [githubAuthoredWorkItemsOnly, setGithubAuthoredWorkItemsOnly] = useStorage('githubAuthoredWorkItemsOnly')
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
  const selectedFullNames = useMemo(
    () => new Set(githubSelectedRepositories.map(repository => repository.fullName)),
    [githubSelectedRepositories],
  )

  const toggleRepository = (repository: GithubSelectedRepository) => {
    void setGithubSelectedRepositories(currentRepositories => {
      if (currentRepositories.some(currentRepository => currentRepository.fullName === repository.fullName)) {
        return currentRepositories.filter(currentRepository => currentRepository.fullName !== repository.fullName)
      }

      return [...currentRepositories, repository].sort(compareGithubRepositories)
    })
  }

  return (
    <SettingsSection title="GitHub">
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

          <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto pr-1 filter">
            {candidateRepositories.map(repository => (
              <input
                key={repository.fullName}
                aria-label={repository.fullName}
                checked={selectedFullNames.has(repository.fullName)}
                className="btn btn-sm"
                type="checkbox"
                onChange={() => toggleRepository(repository)}
              />
            ))}
          </div>

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

      <SettingsRow
        label="Dashboard: Authored by me"
        description="Show only GitHub items opened by you.">
        <input
          aria-label="Only show GitHub work items authored by me"
          checked={githubAuthoredWorkItemsOnly}
          className="toggle toggle-primary"
          type="checkbox"
          onChange={event => void setGithubAuthoredWorkItemsOnly(event.currentTarget.checked)}
        />
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

function normalizePositiveInteger(value: string, fallback: number) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(maxGithubWorkItemSyncLimit, Math.max(1, Math.floor(parsedValue)))
}
