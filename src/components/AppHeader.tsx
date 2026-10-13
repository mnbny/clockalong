import { useHotkeys } from '@mantine/hooks'
import { IconLogout, IconPalette, IconRefresh, IconSettings } from '@tabler/icons-react'
import { useIsFetching } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { capitalCase } from 'change-case'
import { useRef } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { queryKeys } from '../lib/query-client'
import { useClockifySync } from '../services/clockify/sync'
import { useGithubSync } from '../services/github/sync'
import { useLinearSync } from '../services/linear/sync'
import { themeOptions } from '../services/storage/config'
import { syncProviders } from '../services/sync'
import { useTheme } from '../services/theme-provider'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { MoonBunnyLogo } from './MoonBunnyLogo'

export function AppHeader() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const themeSelectRef = useRef<HTMLSelectElement>(null)
  const authState = useAppAuth()
  const clockifySync = useClockifySync()
  const githubSync = useGithubSync()
  const linearSync = useLinearSync()
  const authenticated = authState.value.clockifyAuthenticated
  const clockifySupportingQueriesSyncing =
    useIsFetching({ queryKey: queryKeys.clockify.runningEntry() }) +
      useIsFetching({ queryKey: queryKeys.clockify.summaryReport() }) >
    0
  const providersSyncing =
    clockifySync.syncing || githubSync.syncing || linearSync.syncing || clockifySupportingQueriesSyncing

  useHotkeys([['mod+shift+A', () => themeSelectRef.current?.focus(), { preventDefault: true }]])

  const goToSignIn = async () => {
    console.info('[clockalong auth] goToSignIn: requested from header')
    await navigate({ to: '/sign-in' })
  }

  return (
    <div
      className="border-base-300 bg-base-200 sticky top-0 z-10 grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4"
      data-tauri-drag-region>
      <div />

      <h1 className="pointer-events-none flex h-10 min-w-0 items-center gap-3 justify-self-center text-lg leading-none font-semibold">
        <span className="truncate">Moon Bunny</span>
        <MoonBunnyLogo className="size-10 self-center" />
        <span className="truncate">Clockalong</span>
      </h1>

      <div className="flex items-center gap-1 justify-self-end">
        {authenticated ? (
          <>
            <button
              className="btn btn-square btn-ghost"
              type="button"
              aria-label="Sync all providers"
              disabled={providersSyncing}
              title="Sync all providers"
              onClick={() => void syncProviders().catch(error => appToast.error(getErrorMessage(error)))}>
              <IconRefresh className={`size-5 ${providersSyncing ? 'animate-spin' : ''}`} />
            </button>
            <Link to="/settings" className="btn btn-square btn-ghost" aria-label="Settings">
              <IconSettings className="size-5" />
            </Link>
            <button
              className="btn btn-square btn-ghost"
              type="button"
              aria-label="Go to sign in"
              onClick={() => void goToSignIn()}>
              <IconLogout className="size-5" />
            </button>
          </>
        ) : null}
        <label
          className="btn btn-square btn-ghost relative has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
          title={`Theme: ${capitalCase(theme.theme)} (⌘⇧A)`}>
          <IconPalette className="pointer-events-none size-5" aria-hidden />
          <select
            ref={themeSelectRef}
            aria-label="App theme"
            className="select absolute inset-0 size-full cursor-pointer opacity-0"
            value={theme.theme}
            onChange={event => void setTheme(event.currentTarget.value)}>
            {(['light', 'dark'] as const).map(appearance => (
              <optgroup key={appearance} label={capitalCase(appearance)}>
                {themeOptions
                  .filter(option => option.appearance === appearance)
                  .map(option => (
                    <option key={option.theme} value={option.theme}>
                      {capitalCase(option.theme)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
