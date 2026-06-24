import { IconArrowRight, IconLoader2 } from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'

import { appToast } from '../components/AppToaster'
import { ClinearLogo } from '../components/ClinearLogo'
import { ClockifyIcon } from '../components/icons/ClockifyIcon'
import { LinearIcon } from '../components/icons/LinearIcon'
import { useTauriClinearAuthState } from '../hooks/useTauriClinearAuthState'
import { clinearAuth, type ClinearAuthProvider } from '../services/tauri/authClient'
import { cx } from '../utils/cx'

export const Route = createFileRoute('/_auth/sign-in')({
  component: SignInScreen,
})

function SignInScreen() {
  const authState = useTauriClinearAuthState()
  const [pendingProvider, setPendingProvider] = useState<ClinearAuthProvider | null>(null)

  const startAuthentication = async (provider: ClinearAuthProvider) => {
    setPendingProvider(provider)

    try {
      const result =
        provider === 'linear'
          ? await clinearAuth.startLinearAuthentication()
          : await clinearAuth.startClockifyAuthentication()

      if (result.status === 'notImplemented') {
        appToast.info(`${getProviderName(provider)} authentication is not wired yet.`)
      }
    } catch (error) {
      appToast.error(`Could not start ${getProviderName(provider)} authentication.`, {
        description: getErrorMessage(error),
      })
    } finally {
      setPendingProvider(null)
    }
  }

  return (
    <section className="mx-auto grid min-h-full w-full max-w-md content-center py-8">
      <div className="grid gap-6">
        <header className="grid justify-items-center gap-3 text-center">
          <ClinearLogo showBackground className="text-primary size-14" title="Clinear" />
          <h2 className="text-2xl leading-tight font-semibold tracking-normal">Connect Clinear</h2>
        </header>

        <div className="grid gap-2">
          <AuthenticationButton
            connected={authState.value.linearAuthenticated}
            icon={<LinearIcon className="size-5" />}
            label="Linear"
            loading={pendingProvider === 'linear'}
            onClick={() => void startAuthentication('linear')}
          />
          <AuthenticationButton
            connected={authState.value.clockifyAuthenticated}
            icon={<ClockifyIcon className="size-5" />}
            label="Clockify"
            loading={pendingProvider === 'clockify'}
            onClick={() => void startAuthentication('clockify')}
          />
        </div>
      </div>
    </section>
  )
}

type AuthenticationButtonProps = {
  connected: boolean
  icon: ReactNode
  label: string
  loading: boolean
  onClick: () => void
}

function AuthenticationButton({ connected, icon, label, loading, onClick }: AuthenticationButtonProps) {
  return (
    <button
      className={cx(
        'btn h-14 w-full justify-between rounded-lg border px-4 text-base',
        connected ? 'btn-success' : 'btn-ghost border-base-300 bg-base-200/60 hover:bg-base-200',
      )}
      disabled={loading || connected}
      type="button"
      onClick={onClick}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-primary">{icon}</span>
        <span className="truncate">{connected ? `${label} connected` : `Connect ${label}`}</span>
      </span>
      {loading ? <IconLoader2 className="size-5 animate-spin" /> : <IconArrowRight className="size-5" />}
    </button>
  )
}

function getProviderName(provider: ClinearAuthProvider) {
  switch (provider) {
    case 'clockify':
      return 'Clockify'
    case 'linear':
      return 'Linear'
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
