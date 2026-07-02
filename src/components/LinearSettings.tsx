import { useState } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
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
        <SettingsRow label="Linear account" description="Connect Linear to sync assigned tickets.">
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

  return (
    <SettingsSection title="Linear">
      <SettingsRow label="Ticket sync limit" description="Maximum assigned Linear tickets to sync.">
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

      <SettingsRow label="Ticket sync interval" description="How often assigned Linear tickets sync.">
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

      <SettingsRow label="Ticket sync sort" description="Linear field used when syncing assigned tickets.">
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

      <SettingsRow label="Ticket sort order" description="Client-side ordering used for ticket lists.">
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
