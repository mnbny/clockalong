import { IconCheck, IconRestore } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
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
  defaultLinearTicketSyncLimit,
  getLinearTicketSortOrderLabel,
  getLinearTicketSyncIntervalLabel,
  getLinearTicketSyncOrderByLabel,
  type LinearTicketSortOrderOption,
  linearTicketSortOrderOptions,
  type LinearTicketSyncIntervalOption,
  linearTicketSyncIntervalOptions,
  type LinearTicketSyncOrderByOption,
  linearTicketSyncOrderByOptions,
} from '../services/linear/ticket-settings'
import { useStorage } from '../services/storage/useStorage'
import { auth } from '../services/tauri/auth-client'
import { cx } from '../utils/cx'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { LinearIcon } from './icons/LinearIcon'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

export function LinearSettings() {
  const authState = useAppAuth()
  const [connecting, setConnecting] = useState(false)
  const linearAuthenticated = authState.value.linearAuthenticated && !authState.loading

  const connectLinear = async () => {
    setConnecting(true)

    try {
      await auth.connectLinear()
      appToast.success('Linear connected.')
    } catch (error) {
      appToast.error('Could not connect Linear.', {
        description: getErrorMessage(error),
      })
    } finally {
      setConnecting(false)
    }
  }

  if (!linearAuthenticated) {
    return (
      <SettingsSection title="Linear">
        <SettingsRow label="Linear account" description="Connect Linear to sync assigned issues.">
          <button
            className="btn btn-primary"
            disabled={authState.loading || connecting}
            type="button"
            onClick={() => void connectLinear()}>
            {connecting ? <span className="loading loading-spinner loading-sm" /> : <LinearIcon className="size-5" />}
            Connect Linear
          </button>
        </SettingsRow>
      </SettingsSection>
    )
  }

  return <LinearSettingsContent />
}

function LinearSettingsContent() {
  const [linearTicketSyncLimit, setLinearTicketSyncLimit] = useStorage('linearTicketSyncLimit')
  const [linearTicketSyncInterval, setLinearTicketSyncInterval] = useStorage('linearTicketSyncInterval')
  const [linearTicketSyncOrderBy, setLinearTicketSyncOrderBy] = useStorage('linearTicketSyncOrderBy')
  const [linearTicketSortOrder, setLinearTicketSortOrder] = useStorage('linearTicketSortOrder')
  const [clockifyDescriptionTemplate, setClockifyDescriptionTemplate, resetClockifyDescriptionTemplate] =
    useStorage('clockifyDescriptionTemplate')
  const [
    clockifyDescriptionTemplateFallback,
    setClockifyDescriptionTemplateFallback,
    resetClockifyDescriptionTemplateFallback,
  ] = useStorage('clockifyDescriptionTemplateFallback')

  return (
    <SettingsSection title="Linear">
      <SettingsRow label="Sync: Limit" description="Number of assigned Linear issues to sync.">
        <label className="input input-primary w-full max-w-56">
          <input
            aria-label="Ticket sync limit"
            className="min-w-0 grow text-sm"
            min={1}
            step={1}
            type="number"
            value={linearTicketSyncLimit}
            onChange={event =>
              void setLinearTicketSyncLimit(
                normalizePositiveInteger(event.currentTarget.value, defaultLinearTicketSyncLimit),
              )
            }
          />
        </label>
      </SettingsRow>

      <SettingsRow label="Sync: Interval" description="How often Linear issues refresh.">
        <select
          aria-label="Ticket sync interval"
          className="select select-primary w-full max-w-56"
          value={linearTicketSyncInterval}
          onChange={event =>
            void setLinearTicketSyncInterval(event.currentTarget.value as LinearTicketSyncIntervalOption)
          }>
          {linearTicketSyncIntervalOptions.map(option => (
            <option key={option} value={option}>
              {getLinearTicketSyncIntervalLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Sync: Sort" description="Linear field used for sync order.">
        <select
          aria-label="Ticket sync sort"
          className="select select-primary w-full max-w-56"
          value={linearTicketSyncOrderBy}
          onChange={event =>
            void setLinearTicketSyncOrderBy(event.currentTarget.value as LinearTicketSyncOrderByOption)
          }>
          {linearTicketSyncOrderByOptions.map(option => (
            <option key={option} value={option}>
              {getLinearTicketSyncOrderByLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Dashboard: Sort" description="How Linear issues are ordered on the dashboard.">
        <select
          aria-label="Ticket sort order"
          className="select select-primary w-full max-w-56"
          value={linearTicketSortOrder}
          onChange={event => void setLinearTicketSortOrder(event.currentTarget.value as LinearTicketSortOrderOption)}>
          {linearTicketSortOrderOptions.map(option => (
            <option key={option} value={option}>
              {getLinearTicketSortOrderLabel(option)}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow label="Clockify: Template" description="Clockify description format for Linear timers.">
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

function normalizePositiveInteger(value: string, fallback: number) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
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
