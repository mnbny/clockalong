import { IconArrowRight, IconBrandGithub, IconCheck, IconLoader2 } from '@tabler/icons-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useRef, useState } from 'react'

import { appToast } from '../components/AppToaster'
import { ClockifyAuthDialog } from '../components/ClockifyAuthDialog'
import { GitHubAuthDialog } from '../components/GitHubAuthDialog'
import { ClockifyIcon } from '../components/icons/ClockifyIcon'
import { LinearIcon } from '../components/icons/LinearIcon'
import { useAppAuth } from '../hooks/useAppAuth'
import { queryClient, queryKeys } from '../lib/query-client'
import { clearSyncedClockifyTimeEntries } from '../services/clockify/sync'
import { clearSyncedGithubWorkItems } from '../services/github/sync'
import { clearSyncedLinearTickets } from '../services/linear/sync'
import { storage } from '../services/storage/config'
import { auth, type ClockalongAuthProvider } from '../services/tauri/auth-client'
import { getErrorMessage } from '../utils/errors'

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInScreen,
})

function SignInScreen() {
  const navigate = useNavigate()
  const authState = useAppAuth()
  const clockifyDialogRef = useRef<HTMLDialogElement>(null)
  const githubDialogRef = useRef<HTMLDialogElement>(null)
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
    clockifyDialogRef.current?.showModal()
  }

  const openGithubDialog = () => {
    signInLog('openGithubDialog: opening')
    githubDialogRef.current?.showModal()
  }

  const disconnectProvider = async (provider: ClockalongAuthProvider) => {
    signInLog(`disconnectProvider: requested provider=${provider}`)
    setPendingProvider(provider)

    try {
      if (provider === 'clockify') {
        await auth.disconnectClockify()
        const clearedTimeEntries = await clearClockifySessionState()
        signInLog('disconnectProvider: clockify disconnected')
        signInLog(`disconnectProvider: cleared_clockify_time_entries=${clearedTimeEntries}`)
        appToast.success('Clockify disconnected.')
        return
      }

      if (provider === 'github') {
        await auth.disconnectGithub()
        const clearedWorkItems = await clearSyncedGithubWorkItems()
        signInLog('disconnectProvider: github disconnected')
        signInLog(`disconnectProvider: cleared_github_work_items=${clearedWorkItems}`)
        appToast.success('GitHub disconnected.')
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
          <AuthenticationButton
            connected={authState.value.githubAuthenticated}
            icon={<IconBrandGithub className="size-5" />}
            label="GitHub"
            loading={pendingProvider === 'github'}
            onDisconnect={() => void disconnectProvider('github')}
            onClick={openGithubDialog}
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

      <ClockifyAuthDialog
        ref={clockifyDialogRef}
        onConnected={() => {
          void resetClockifyQueryCache()
        }}
        onPendingChange={pending => setPendingProvider(pending ? 'clockify' : null)}
      />
      <GitHubAuthDialog
        ref={githubDialogRef}
        onPendingChange={pending => setPendingProvider(pending ? 'github' : null)}
      />
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

async function clearClockifySessionState() {
  await resetClockifyQueryCache()
  const clearedTimeEntries = await clearSyncedClockifyTimeEntries()
  await Promise.all([storage.remove('clockifyDefaultProject'), storage.remove('clockifyQuickTimerEntryLinks')])

  return clearedTimeEntries
}

async function resetClockifyQueryCache() {
  await queryClient.cancelQueries({ queryKey: queryKeys.clockify.all })
  queryClient.removeQueries({ queryKey: queryKeys.clockify.all })
}

function getProviderLabel(provider: ClockalongAuthProvider) {
  switch (provider) {
    case 'clockify':
      return 'Clockify'
    case 'github':
      return 'GitHub'
    case 'linear':
      return 'Linear'
  }
}
