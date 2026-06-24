import type { ReactNode } from 'react'

import { IconCopy, IconFileText, IconRefresh, IconTrash, IconX } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { appToast } from '../components/AppToaster'
import { PageHeader } from '../components/PageHeader'
import { useTauriAppLogs } from '../hooks/useTauriAppLogs'
import {
  type DefaultViewOption,
  defaultViewOptions,
  type RefreshIntervalOption,
  refreshIntervalOptions,
  type ThemeOption,
  themeOptions,
} from '../services/storage/config'
import { useStorage } from '../services/storage/useStorage'
import { app } from '../services/tauri/appClient'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsScreen,
})

function SettingsScreen() {
  const [theme, setTheme] = useStorage('theme')
  const [displayName, setDisplayName] = useStorage('displayName')
  const [defaultView, setDefaultView] = useStorage('defaultView')
  const [refreshInterval, setRefreshInterval] = useStorage('refreshInterval')
  const [desktopAlerts, setDesktopAlerts] = useStorage('desktopAlerts')
  const [compactRows, setCompactRows] = useStorage('compactRows')
  const [density, setDensity] = useStorage('density')
  const [appLogsDrawerOpen, setAppLogsDrawerOpen] = useState(false)
  const appLogs = useTauriAppLogs({ enabled: appLogsDrawerOpen })
  const displayedAppLogs = useMemo(() => filterDisplayedAppLogs(appLogs.value.contents), [appLogs.value.contents])
  const clearAppLogsMutation = useMutation({
    mutationFn: app.clearLogFile,
    onError: error => {
      appToast.error('Could not clear logs', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: () => {
      appToast.success('Logs cleared')
      void appLogs.refresh()
    },
  })

  const openAppLogsDrawer = () => {
    setAppLogsDrawerOpen(true)
  }

  const copyAppLogs = async () => {
    if (!displayedAppLogs) {
      return
    }

    try {
      await navigator.clipboard.writeText(displayedAppLogs)
      appToast.success('Logs copied')
    } catch (error) {
      appToast.error('Could not copy logs', {
        description: getErrorMessage(error),
      })
    }
  }

  return (
    <div className="drawer drawer-end">
      <input
        id="settings-app-logs-drawer"
        aria-label="App logs drawer"
        checked={appLogsDrawerOpen}
        className="drawer-toggle"
        type="checkbox"
        onChange={event => setAppLogsDrawerOpen(event.currentTarget.checked)}
      />

      <div className="drawer-content">
        <section className="flex w-full flex-col gap-8">
          <PageHeader
            title="Settings"
            actions={
              <Link to="/dashboard" className="btn btn-square btn-ghost" aria-label="Close settings">
                <IconX className="size-5" />
              </Link>
            }
          />

          <div className="flex w-full flex-col gap-10">
            <SettingsSection title="Profile">
              <SettingsRow label="Display name" description="Local name used in app previews.">
                <label className="input input-primary w-full max-w-sm">
                  <input
                    aria-label="Display name"
                    className="min-w-0 grow text-sm"
                    type="text"
                    value={displayName}
                    onChange={event => void setDisplayName(event.currentTarget.value)}
                  />
                </label>
              </SettingsRow>

              <SettingsRow label="Desktop alerts" description="Show local desktop notifications.">
                <input
                  aria-label="Desktop alerts"
                  checked={desktopAlerts}
                  className="toggle toggle-primary"
                  type="checkbox"
                  onChange={event => void setDesktopAlerts(event.currentTarget.checked)}
                />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Workflow">
              <SettingsRow label="Default view" description="Choose the first screen to open after sign-in.">
                <select
                  aria-label="Default view"
                  className="select select-primary w-full max-w-56"
                  value={defaultView}
                  onChange={event => void setDefaultView(event.currentTarget.value as DefaultViewOption)}>
                  {defaultViewOptions.map(option => (
                    <option key={option} value={option}>
                      {getDefaultViewLabel(option)}
                    </option>
                  ))}
                </select>
              </SettingsRow>

              <SettingsRow label="Refresh interval" description="Choose how often the app checks for updates.">
                <select
                  aria-label="Refresh interval"
                  className="select select-primary w-full max-w-56"
                  value={refreshInterval}
                  onChange={event => void setRefreshInterval(event.currentTarget.value as RefreshIntervalOption)}>
                  {refreshIntervalOptions.map(option => (
                    <option key={option} value={option}>
                      {getRefreshIntervalLabel(option)}
                    </option>
                  ))}
                </select>
              </SettingsRow>

              <SettingsRow label="Compact rows" description="Use tighter spacing in lists and tables.">
                <input
                  aria-label="Compact rows"
                  checked={compactRows}
                  className="toggle toggle-primary"
                  type="checkbox"
                  onChange={event => void setCompactRows(event.currentTarget.checked)}
                />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="App">
              <SettingsRow label="Theme" description="Controls the app appearance.">
                <fieldset className="flex flex-wrap items-center gap-4" aria-label="Theme">
                  {themeOptions.map(option => (
                    <label key={option.theme} className="flex cursor-pointer items-center gap-2">
                      <input
                        checked={theme.theme === option.theme}
                        className="radio radio-primary radio-sm"
                        name="theme"
                        type="radio"
                        onChange={() => void setTheme(option)}
                      />
                      <span className="text-sm leading-6">{getThemeLabel(option)}</span>
                    </label>
                  ))}
                </fieldset>
              </SettingsRow>

              <SettingsRow label="Density" description="Adjust spacing across app screens.">
                <div className="flex w-full max-w-56 items-center gap-3">
                  <input
                    aria-label="Density"
                    className="range range-primary range-sm min-w-0 flex-1"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={density}
                    onChange={event => void setDensity(Number(event.currentTarget.value))}
                  />
                  <span className="text-base-content/70 w-10 text-right text-xs tabular-nums">{density}%</span>
                </div>
              </SettingsRow>

              <SettingsRow label="App logs" description="View Rust and browser console logs from this app.">
                <button className="btn btn-primary btn-sm" type="button" onClick={openAppLogsDrawer}>
                  <IconFileText className="size-4" />
                  View logs
                </button>
              </SettingsRow>
            </SettingsSection>
          </div>
        </section>
      </div>

      <div className="drawer-side z-50">
        <button
          type="button"
          className="drawer-overlay fixed inset-0"
          aria-label="Close app logs"
          onClick={() => setAppLogsDrawerOpen(false)}
        />

        <aside className="bg-base-100 text-base-content border-base-content/5 flex h-full w-[min(40rem,calc(100dvw-3rem))] flex-col border-l">
          <div className="border-base-content/5 border-b p-4">
            <PageHeader
              title="App logs"
              description="Rust backend and forwarded browser console output."
              actions={
                <>
                  <button
                    className="btn btn-square btn-ghost btn-sm"
                    type="button"
                    aria-label="Copy logs"
                    disabled={appLogs.loading || !displayedAppLogs}
                    onClick={() => void copyAppLogs()}>
                    <IconCopy className="size-4" />
                  </button>
                  <button
                    className="btn btn-square btn-ghost btn-sm"
                    type="button"
                    aria-label="Clear logs"
                    disabled={appLogs.loading || clearAppLogsMutation.isPending || !displayedAppLogs}
                    onClick={() => clearAppLogsMutation.mutate()}>
                    {clearAppLogsMutation.isPending ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <IconTrash className="size-4" />
                    )}
                  </button>
                  <button
                    className="btn btn-square btn-ghost btn-sm"
                    type="button"
                    aria-label="Refresh logs"
                    disabled={clearAppLogsMutation.isPending}
                    onClick={() => void appLogs.refresh()}>
                    <IconRefresh className="size-4" />
                  </button>
                  <button
                    className="btn btn-square btn-ghost btn-sm"
                    type="button"
                    aria-label="Close logs"
                    onClick={() => setAppLogsDrawerOpen(false)}>
                    <IconX className="size-4" />
                  </button>
                </>
              }
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <pre className="bg-base-200 min-h-full overflow-x-auto rounded-md p-4 font-mono text-xs leading-5 whitespace-pre">
              {appLogs.loading
                ? 'Loading logs...'
                : appLogs.error
                  ? `Failed to load logs: ${appLogs.error}`
                  : displayedAppLogs || 'No matching app logs yet.'}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  )
}

type SettingsSectionProps = {
  title: string
  children: ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-2">
      <h2 className="text-sm leading-6 font-semibold tracking-normal">{title}</h2>
      <div className="rounded-box divide-base-content/5 bg-base-100 border-base-content/5 divide-y overflow-hidden border">
        {children}
      </div>
    </section>
  )
}

type SettingsRowProps = {
  label: string
  description: string
  children: ReactNode
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:items-center sm:gap-10">
      <div className="min-w-0 sm:text-right">
        <div className="text-sm leading-6 font-medium">{label}</div>
        <p className="text-xs leading-5">{description}</p>
      </div>

      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  )
}

function getDefaultViewLabel(defaultView: DefaultViewOption) {
  switch (defaultView) {
    case 'active':
      return 'Active items'
    case 'dashboard':
      return 'Dashboard'
    case 'recent':
      return 'Recent items'
  }
}

function getRefreshIntervalLabel(refreshInterval: RefreshIntervalOption) {
  switch (refreshInterval) {
    case 'manual':
      return 'Manual'
    case '5m':
      return 'Every 5 minutes'
    case '15m':
      return 'Every 15 minutes'
    case '30m':
      return 'Every 30 minutes'
  }
}

function getThemeLabel(theme: ThemeOption) {
  switch (theme.theme) {
    case 'night':
      return 'Dark'
    case 'winter':
      return 'Light'
  }
}

function filterDisplayedAppLogs(contents: string) {
  return contents.split('\n').filter(isDisplayedAppLogLine).join('\n')
}

function isDisplayedAppLogLine(line: string) {
  return isRustAppLogLine(line) || isCustomFrontendLogLine(line)
}

function isRustAppLogLine(line: string) {
  return line.includes('][clinear')
}

function isCustomFrontendLogLine(line: string) {
  return line.includes('][webview:') && customFrontendLogPrefixes.some(prefix => line.includes(prefix))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

const customFrontendLogPrefixes = [
  '[app initialization]',
  '[app logs]',
  '[console logging]',
  '[clinear auth]',
  '[dev tools]',
  '[sign in]',
  '[storage]',
  '[storage hook]',
]
