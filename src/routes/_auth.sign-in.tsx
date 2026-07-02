import { IconArrowRight, IconCheck, IconExternalLink, IconLoader2 } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'

import { appToast } from '../components/AppToaster'
import { ClockifyIcon } from '../components/icons/ClockifyIcon'
import { LinearIcon } from '../components/icons/LinearIcon'
import { useAppAuth } from '../hooks/useAppAuth'
import { clearSyncedLinearTickets } from '../services/linear/sync'
import { auth, type ClockalongAuthProvider } from '../services/tauri/auth-client'
import { getErrorMessage } from '../utils/errors'

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInScreen,
})

function SignInScreen() {
  const navigate = useNavigate()
  const authState = useAppAuth()
  const clockifyDialogRef = useRef<HTMLDialogElement>(null)
  const [clockifyApiKey, setClockifyApiKey] = useState('')
  const [pendingProvider, setPendingProvider] = useState<ClockalongAuthProvider | null>(null)
  const clockifyAuthenticated = authState.value.clockifyAuthenticated

  const connectLinear = async () => {
    signInLog('connectLinear: requested')
    setPendingProvider('linear')

    try {
      const result = await auth.connectLinear()
      signInLog(`connectLinear: status=${result.status}`)
      appToast.success('Linear connected.')
    } catch (error) {
      signInLog(`connectLinear: failed=${getErrorMessage(error)}`)
      appToast.error('Could not connect Linear.', {
        description: getErrorMessage(error),
      })
    } finally {
      setPendingProvider(null)
    }
  }

  const openClockifyDialog = () => {
    signInLog('openClockifyDialog: opening')
    setClockifyApiKey('')
    clockifyDialogRef.current?.showModal()
  }

  const disconnectProvider = async (provider: ClockalongAuthProvider) => {
    signInLog(`disconnectProvider: requested provider=${provider}`)
    setPendingProvider(provider)

    try {
      if (provider === 'clockify') {
        await auth.disconnectClockify()
        signInLog('disconnectProvider: clockify disconnected')
        appToast.success('Clockify disconnected.')
        return
      }

      const result = await auth.disconnectLinear()
      const clearedTickets = await clearSyncedLinearTickets()
      signInLog(`disconnectProvider: linear disconnected revocation_status=${result.revocationStatus}`)
      signInLog(`disconnectProvider: cleared_linear_tickets=${clearedTickets}`)
      appToast.success('Linear disconnected.')
    } catch (error) {
      signInLog(`disconnectProvider: failed provider=${provider} error=${getErrorMessage(error)}`)
      appToast.error(`Could not disconnect ${getProviderLabel(provider)}.`, {
        description: getErrorMessage(error),
      })
    } finally {
      setPendingProvider(null)
    }
  }

  const goToDashboard = async () => {
    signInLog('goToDashboard: requested')
    await navigate({ to: '/dashboard' })
  }

  const connectClockify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    signInLog(`connectClockify: submitting key_len=${clockifyApiKey.trim().length}`)
    setPendingProvider('clockify')

    try {
      await auth.connectClockify(clockifyApiKey)
      signInLog('connectClockify: connected')
      appToast.success('Clockify connected.')
      clockifyDialogRef.current?.close()
      setClockifyApiKey('')
    } catch (error) {
      signInLog(`connectClockify: failed=${getErrorMessage(error)}`)
      appToast.error('Could not connect Clockify.', {
        description: getErrorMessage(error),
      })
    } finally {
      setPendingProvider(null)
    }
  }

  return (
    <section className="mx-auto grid min-h-full w-full max-w-md content-center py-8">
      <div className="grid gap-6">
        <div className="grid gap-2">
          <AuthenticationButton
            connected={clockifyAuthenticated}
            icon={<ClockifyIcon className="size-5" />}
            label="Clockify"
            loading={pendingProvider === 'clockify'}
            onDisconnect={() => void disconnectProvider('clockify')}
            onClick={openClockifyDialog}
          />
          <AuthenticationButton
            connected={authState.value.linearAuthenticated}
            icon={<LinearIcon className="size-5" />}
            label="Linear"
            loading={pendingProvider === 'linear'}
            onDisconnect={() => void disconnectProvider('linear')}
            onClick={() => void connectLinear()}
          />
          <button
            className="btn btn-primary mt-4 h-12 self-center rounded-lg"
            disabled={!clockifyAuthenticated || Boolean(pendingProvider)}
            type="button"
            onClick={() => void goToDashboard()}>
            Go to dashboard
            <IconArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <dialog ref={clockifyDialogRef} className="modal">
        <div className="modal-box max-w-md rounded-lg">
          <form className="grid gap-5" onSubmit={event => void connectClockify(event)}>
            <div className="grid gap-2">
              <h3 className="text-lg leading-7 font-semibold">Connect Clockify</h3>
              <a
                className="link link-primary inline-flex w-fit items-center gap-1 text-sm"
                href="https://app.clockify.me/manage-api-keys"
                rel="noreferrer"
                target="_blank">
                Find your API key
                <IconExternalLink className="size-4" />
              </a>
            </div>

            <label className="form-control grid gap-2">
              <span className="label-text text-sm font-medium">API key</span>
              <input
                autoComplete="off"
                autoFocus
                className="input input-bordered w-full font-mono text-sm"
                disabled={pendingProvider === 'clockify'}
                spellCheck={false}
                type="text"
                value={clockifyApiKey}
                onChange={event => setClockifyApiKey(event.target.value)}
              />
            </label>

            <div className="modal-action mt-0">
              <button
                className="btn btn-ghost"
                disabled={pendingProvider === 'clockify'}
                type="button"
                onClick={() => clockifyDialogRef.current?.close()}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={pendingProvider === 'clockify'} type="submit">
                {pendingProvider === 'clockify' ? <span className="loading loading-spinner loading-sm" /> : null}
                Connect
              </button>
            </div>
          </form>
        </div>

        <form className="modal-backdrop" method="dialog">
          <button>close</button>
        </form>
      </dialog>
    </section>
  )
}

type AuthenticationButtonProps = {
  connected: boolean
  icon: ReactNode
  label: string
  loading: boolean
  onDisconnect: () => void
  onClick: () => void
}

function AuthenticationButton({ connected, icon, label, loading, onClick, onDisconnect }: AuthenticationButtonProps) {
  if (connected) {
    return (
      <div className="relative">
        <button
          className="btn btn-success h-14 w-full justify-between rounded-lg border px-4 text-base"
          disabled
          type="button">
          <span className="flex min-w-0 items-center gap-3">
            <span className="text-primary">{icon}</span>
            <span className="truncate">{label} connected</span>
          </span>
          {loading ? <IconLoader2 className="size-5 animate-spin" /> : <IconCheck className="text-primary size-5" />}
        </button>
        {!loading ? (
          <button
            className="badge badge-error absolute top-1/2 right-12 h-7 -translate-y-1/2 px-3"
            type="button"
            onClick={onDisconnect}>
            Disconnect
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <button
      className="btn btn-ghost border-base-300 bg-base-200/60 hover:bg-base-200 h-14 w-full justify-between rounded-lg border px-4 text-base"
      disabled={loading}
      type="button"
      onClick={onClick}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-primary">{icon}</span>
        <span className="truncate">Connect {label}</span>
      </span>
      {loading ? <IconLoader2 className="size-5 animate-spin" /> : <IconArrowRight className="size-5" />}
    </button>
  )
}

function signInLog(message: string) {
  console.info(`[sign in] ${message}`)
}

function getProviderLabel(provider: ClockalongAuthProvider) {
  return provider === 'clockify' ? 'Clockify' : 'Linear'
}
