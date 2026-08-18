import {
  IconCopy,
  IconDownload,
  IconFileText,
  IconRefresh,
  IconRestore,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { type ChangeEvent, useMemo, useRef, useState } from 'react'

import { useAppLogs } from '../hooks/useAppLogs'
import { storage, type ThemeOption, themeOptions } from '../services/storage/config'
import { type StorageKey, type StorageValue } from '../services/storage/storage'
import { useStorage } from '../services/storage/useStorage'
import { app } from '../services/tauri/app-client'
import { type AppUpdate, type AppUpdateDownloadProgress, appUpdates } from '../services/tauri/app-updates'
import { mcp, useMcpServerStatus } from '../services/tauri/mcp-client'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { PageHeader } from './PageHeader'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

const settingsBackupKeys = [
  'clockifyBillable',
  'clockifyDefaultProject',
  'clockifyOverrideProject',
  'clockifyOverrideProjectVisibility',
  'clockifyDescriptionTemplate',
  'clockifyDescriptionTemplateFallback',
  'clockifyEntrySyncDays',
  'clockifyEntrySyncInterval',
  'quickTimersEnabled',
  'quickTimersColumns',
  'quickTimers',
  'quickTimersCache',
  'menuBarVisible',
  'mcpServerEnabled',
  'linearTicketSyncLimit',
  'linearTicketSyncInterval',
  'linearTicketSyncOrderBy',
  'linearTicketSortOrder',
  'githubSelectedRepositories',
  'githubVisibleWorkItemTypes',
  'githubWorkItemSyncLimit',
  'githubWorkItemSyncInterval',
  'githubSelectedAuthors',
  'githubSelectedLabels',
  'githubShowClosedWorkItems',
  'githubIssueDescriptionTemplate',
  'githubIssueDescriptionTemplateFallback',
  'githubPullRequestDescriptionTemplate',
  'githubPullRequestDescriptionTemplateFallback',
  'theme',
] as const satisfies readonly StorageKey<typeof storage.config>[]

type SettingsBackupKey = (typeof settingsBackupKeys)[number]

export function AppSettings() {
  const [theme, setTheme] = useStorage('theme')
  const [menuBarVisible, setMenuBarVisible] = useStorage('menuBarVisible')
  const [mcpServerEnabled, setMcpServerEnabled] = useStorage('mcpServerEnabled')
  const settingsImportInputRef = useRef<HTMLInputElement>(null)
  const [appLogsDrawerOpen, setAppLogsDrawerOpen] = useState(false)
  const [importingSettings, setImportingSettings] = useState(false)
  const [resettingSettings, setResettingSettings] = useState(false)
  const appLogs = useAppLogs({ enabled: appLogsDrawerOpen })
  const mcpServerStatus = useMcpServerStatus()
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
  const setMcpServerEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await mcp.setEnabled(enabled)
      await setMcpServerEnabled(enabled)
    },
    onError: error => {
      appToast.error('Could not update MCP server', {
        description: getErrorMessage(error),
      })
    },
  })

  const copyMcpRegistrationCommand = async () => {
    const port = mcpServerStatus.value.port

    if (!mcpServerStatus.value.running || !port) {
      return
    }

    try {
      await navigator.clipboard.writeText(getMcpRegistrationCommand(port))
      appToast.success('MCP registration command copied')
    } catch (error) {
      appToast.error('Could not copy MCP registration command', {
        description: getErrorMessage(error),
      })
    }
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

  const downloadAppLogs = () => {
    if (!displayedAppLogs) {
      return
    }

    downloadTextFile(
      displayedAppLogs,
      'text/plain;charset=utf-8',
      `clockalong-logs-${getDownloadTimestamp(new Date())}.txt`,
    )
    appToast.success('Logs downloaded')
  }

  const exportSettings = async () => {
    try {
      await downloadSettingsBackup()
      appToast.success('Settings exported', {
        description: 'Saved to your Downloads folder.',
      })
    } catch (error) {
      appToast.error('Could not export settings', {
        description: getErrorMessage(error),
      })
    }
  }

  const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]

    event.currentTarget.value = ''

    if (!file) {
      return
    }

    setImportingSettings(true)

    try {
      const snapshot = parseSettingsSnapshot(await file.text())
      const { importedKeys, skippedKeys } = await importSettingsBackup(snapshot)
      await syncNativeMcpServerEnabled()

      appToast.success('Settings imported', {
        description: getSettingsImportDescription(importedKeys.length, skippedKeys.length),
      })
    } catch (error) {
      appToast.error('Could not import settings', {
        description: getErrorMessage(error),
      })
    } finally {
      setImportingSettings(false)
    }
  }

  const resetSettings = async () => {
    setResettingSettings(true)

    try {
      await downloadSettingsBackup()
      await resetSettingsBackup()
      await syncNativeMcpServerEnabled()
      appToast.success('Settings reset', {
        description: 'A backup was saved to your Downloads folder.',
      })
    } catch (error) {
      appToast.error('Could not reset settings', {
        description: getErrorMessage(error),
      })
    } finally {
      setResettingSettings(false)
    }
  }

  const backupActionPending = importingSettings || resettingSettings

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
        <SettingsSection title="App">
          <SettingsRow label="Theme" description="App color theme.">
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

          <SettingsRow label="Menu bar" description="Show Clockalong in the macOS menu bar.">
            <input
              aria-label="Show menu bar item"
              checked={menuBarVisible}
              className="toggle toggle-primary"
              type="checkbox"
              onChange={event => void setMenuBarVisible(event.currentTarget.checked)}
            />
          </SettingsRow>

          <SettingsRow label="MCP server" description="Allow local agents to read work and control timers.">
            <div className="flex w-full min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  aria-label="Enable MCP server"
                  checked={mcpServerEnabled}
                  className="toggle toggle-primary"
                  type="checkbox"
                  disabled={!isTauri() || mcpServerStatus.loading || setMcpServerEnabledMutation.isPending}
                  onChange={event => setMcpServerEnabledMutation.mutate(event.currentTarget.checked)}
                />
                <span className="text-sm leading-6">{getMcpServerStatusText(mcpServerStatus)}</span>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {mcpServerStatus.value.running && mcpServerStatus.value.port ? (
                  <code className="bg-base-200 rounded px-2 py-1 text-xs">Port {mcpServerStatus.value.port}</code>
                ) : null}
                <button
                  className="btn btn-outline btn-primary btn-sm"
                  type="button"
                  disabled={!mcpServerStatus.value.running || !mcpServerStatus.value.port}
                  onClick={() => void copyMcpRegistrationCommand()}>
                  <IconCopy className="size-4" />
                  Copy setup command
                </button>
              </div>
            </div>
          </SettingsRow>

          <SettingsRow label="Backup" description="Export, import, or reset app settings and Quick Timers.">
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={backupActionPending}
                onClick={() => void exportSettings()}>
                <IconDownload className="size-4" />
                Export
              </button>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={backupActionPending}
                onClick={() => settingsImportInputRef.current?.click()}>
                {importingSettings ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <IconUpload className="size-4" />
                )}
                Import
              </button>
              <input
                ref={settingsImportInputRef}
                accept="application/json,.json"
                aria-label="Import settings"
                className="hidden"
                disabled={backupActionPending}
                type="file"
                onChange={event => void importSettings(event)}
              />
              <button
                className="btn btn-error btn-sm"
                type="button"
                disabled={backupActionPending}
                onClick={() => void resetSettings()}>
                {resettingSettings ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <IconRestore className="size-4" />
                )}
                Reset
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label="Updates" description="Check for app updates.">
            <AppUpdatesControl />
          </SettingsRow>

          <SettingsRow label="App logs" description="View app diagnostic logs.">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setAppLogsDrawerOpen(true)}>
              <IconFileText className="size-4" />
              View logs
            </button>
          </SettingsRow>
        </SettingsSection>
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
                    aria-label="Download logs"
                    disabled={appLogs.loading || !displayedAppLogs}
                    onClick={downloadAppLogs}>
                    <IconDownload className="size-4" />
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

function AppUpdatesControl() {
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdate | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [progress, setProgress] = useState<AppUpdateDownloadProgress | null>(null)

  const checkForUpdate = async () => {
    setChecking(true)
    setInstalled(false)
    setProgress(null)

    try {
      const update = await appUpdates.check()
      setAvailableUpdate(update)

      if (update) {
        appToast.info(`Clockalong ${update.version} is available`)
      } else {
        appToast.success('Clockalong is up to date')
      }
    } catch (error) {
      appToast.error('Could not check for updates', {
        description: getErrorMessage(error),
      })
    } finally {
      setChecking(false)
    }
  }

  const installUpdate = async () => {
    if (!availableUpdate) {
      return
    }

    setInstalling(true)
    setProgress(null)

    try {
      await appUpdates.install(setProgress)
      setInstalled(true)
      appToast.success('Update installed', {
        description: 'Restart Clockalong to finish.',
      })
    } catch (error) {
      appToast.error('Could not install update', {
        description: getErrorMessage(error),
      })
    } finally {
      setInstalling(false)
    }
  }

  const progressPercent = getUpdateProgressPercent(progress)

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          disabled={checking || installing}
          onClick={checkForUpdate}>
          {checking ? <span className="loading loading-spinner loading-xs" /> : <IconRefresh className="size-4" />}
          Check
        </button>

        {availableUpdate && !installed ? (
          <button
            className="btn btn-outline btn-primary btn-sm"
            type="button"
            disabled={checking || installing}
            onClick={() => void installUpdate()}>
            {installing ? <span className="loading loading-spinner loading-xs" /> : <IconDownload className="size-4" />}
            Install
          </button>
        ) : null}

        {installed ? (
          <button
            className="btn btn-outline btn-primary btn-sm"
            type="button"
            onClick={() => {
              void appUpdates.relaunch()
            }}>
            <IconRefresh className="size-4" />
            Restart
          </button>
        ) : null}
      </div>

      {availableUpdate ? (
        <div className="bg-base-200 rounded-box min-w-0 p-3">
          <div className="text-sm leading-6 font-medium">Clockalong {availableUpdate.version}</div>
          {availableUpdate.body ? (
            <div className="text-base-content/70 overflow-wrap-anywhere mt-1 text-xs leading-5 whitespace-pre-wrap">
              {availableUpdate.body}
            </div>
          ) : null}
          {availableUpdate.date ? (
            <div className="text-base-content/60 mt-2 text-xs leading-5">
              Published {new Date(availableUpdate.date).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}

      {progress ? (
        <div className="flex w-full max-w-sm flex-col gap-1">
          <progress className="progress progress-primary w-full" value={progressPercent ?? 0} max={100} />
          <div className="text-base-content/60 text-xs leading-5">{formatUpdateProgress(progress)}</div>
        </div>
      ) : null}
    </div>
  )
}

function getThemeLabel(theme: ThemeOption) {
  switch (theme.theme) {
    case 'abyss':
      return 'Dark'
    case 'emerald':
      return 'Light'
  }
}

function getMcpServerStatusText(status: ReturnType<typeof useMcpServerStatus>) {
  if (status.loading) {
    return 'Checking status...'
  }

  if (status.value.lastError) {
    return `Failed: ${status.value.lastError}`
  }

  if (status.error) {
    return `Unavailable: ${status.error}`
  }

  if (status.value.running && status.value.port) {
    return `Running on port ${status.value.port}`
  }

  return isTauri() ? 'Stopped' : 'Unavailable outside the desktop app'
}

function getMcpRegistrationCommand(port: number) {
  return `claude mcp add --transport http clockalong http://127.0.0.1:${port}/mcp`
}

function getUpdateProgressPercent(progress: AppUpdateDownloadProgress | null) {
  if (!progress?.totalBytes) {
    return null
  }

  return Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100))
}

function formatUpdateProgress(progress: AppUpdateDownloadProgress) {
  if (!progress.totalBytes) {
    return `${formatBytes(progress.downloadedBytes)} downloaded`
  }

  return `${formatBytes(progress.downloadedBytes)} of ${formatBytes(progress.totalBytes)}`
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function downloadTextFile(contents: string, type: string, filename: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getDownloadTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:.]/g, '-')
}

async function downloadSettingsBackup() {
  const snapshot = await storage.getSnapshot()

  downloadTextFile(
    JSON.stringify(snapshot, null, 2),
    'application/json;charset=utf-8',
    `clockalong-settings-${getDownloadTimestamp(new Date())}.json`,
  )
}

function parseSettingsSnapshot(contents: string) {
  let snapshot: unknown

  try {
    snapshot = JSON.parse(contents)
  } catch {
    throw new Error('Choose a valid Clockalong settings JSON file.')
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Choose a valid Clockalong settings JSON file.')
  }

  return snapshot as Record<string, unknown>
}

function getSettingsImportDescription(importedCount: number, skippedCount: number) {
  const importedLabel = `${importedCount} setting${importedCount === 1 ? '' : 's'} restored`

  if (!skippedCount) {
    return importedLabel
  }

  return `${importedLabel}; ${skippedCount} unsupported setting${skippedCount === 1 ? '' : 's'} skipped`
}

async function importSettingsBackup(snapshot: Record<string, unknown>) {
  const importedKeys: SettingsBackupKey[] = []
  const skippedKeys: SettingsBackupKey[] = []

  for (const key of settingsBackupKeys) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
      continue
    }

    const value = snapshot[key]

    if (!isStorageValue(key, value)) {
      skippedKeys.push(key)
      continue
    }

    await storage.set(key, value)
    importedKeys.push(key)
  }

  if (!importedKeys.length) {
    throw new Error('This file does not contain any supported Clockalong settings.')
  }

  return { importedKeys, skippedKeys }
}

async function resetSettingsBackup() {
  for (const key of settingsBackupKeys) {
    await storage.remove(key)
  }
}

async function syncNativeMcpServerEnabled() {
  if (!isTauri()) {
    return
  }

  await mcp.setEnabled(await storage.get('mcpServerEnabled'))
}

function isStorageValue<K extends StorageKey<typeof storage.config>>(
  key: K,
  value: unknown,
): value is StorageValue<typeof storage.config, K> {
  switch (storage.config[key].type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'object':
      return value === null || typeof value === 'object'
    case 'string':
      return typeof value === 'string'
  }
}

function filterDisplayedAppLogs(contents: string) {
  return contents.split('\n').filter(isDisplayedAppLogLine).join('\n')
}

function isDisplayedAppLogLine(line: string) {
  return isRustAppLogLine(line) || isCustomFrontendLogLine(line)
}

function isRustAppLogLine(line: string) {
  return line.includes('][clockalong')
}

function isCustomFrontendLogLine(line: string) {
  return line.includes('][webview:') && customFrontendLogPrefixes.some(prefix => line.includes(prefix))
}

const customFrontendLogPrefixes = [
  '[app initialization]',
  '[app updates]',
  '[app logs]',
  '[clockify api]',
  '[clockify auth]',
  '[clockify sync]',
  '[clockify widget]',
  '[console logging]',
  '[clockalong auth]',
  '[clockalong mcp]',
  '[dev tools]',
  '[github sync]',
  '[github widget]',
  '[linear auth]',
  '[linear tickets]',
  '[linear widget]',
  '[LocalStorageCollection]',
  '[menu bar]',
  '[mcp command]',
  '[quick timers]',
  '[sign in]',
  '[storage]',
  '[storage hook]',
]
