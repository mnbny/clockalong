import type { TimeEntryWithRatesDtoV1 } from '../services/clockify/generated/clockify'
import type { SyncedClockifyTimeEntry } from '../services/clockify/sync'
import type { MenuItemOptions, PredefinedMenuItemOptions } from '@tauri-apps/api/menu'

import { and, eq, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { defaultWindowIcon } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { appToast } from '../components/AppToaster'
import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import { clockifyTimeEntriesCollection } from '../services/clockify/sync'
import {
  getClockifyTimeEntryTitle,
  resumeClockifyTimeEntry,
  stopClockifyTimeEntry,
} from '../services/clockify/time-entries'
import { useStorage } from '../services/storage/useStorage'
import { getErrorMessage } from '../utils/errors'
import { useAppAuth } from './useAppAuth'
import { useAppInit } from './useAppInit'

const menuBarTrayId = 'clockalong-menu-bar'
const recentEntryLimit = 5
const menuBarTitleSeparator = ' · '

type MenuBarDestination = '/dashboard' | '/settings'
type NativeMenuItem = MenuItemOptions | PredefinedMenuItemOptions

export function useMenuBar() {
  const appInitializationState = useAppInit()
  const authState = useAppAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [, setQuickTimersActiveEntry] = useStorage('quickTimersActiveEntry')
  const [menuBarVisible] = useStorage('menuBarVisible')
  const [tray, setTray] = useState<TrayIcon | null>(null)
  const trayTitleUpdates = useRef(Promise.resolve())
  const clockifyEnabled =
    !appInitializationState.value.appInitializing && !authState.loading && authState.value.clockifyAuthenticated
  const userQuery = useQuery({
    enabled: clockifyEnabled,
    queryKey: queryKeys.clockify.loggedUser,
    queryFn: () => clockify.getLoggedUser(),
    staleTime: 5 * 60_000,
  })
  const workspacesQuery = useQuery({
    enabled: clockifyEnabled,
    queryKey: queryKeys.clockify.workspaces,
    queryFn: () => clockify.getWorkspacesOfUser(),
    staleTime: 5 * 60_000,
  })
  const selectedWorkspace = useMemo(() => {
    const user = userQuery.data
    const workspaces = workspacesQuery.data

    if (!user || !workspaces?.length) {
      return null
    }

    return (
      workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
      workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
      workspaces[0]
    )
  }, [userQuery.data, workspacesQuery.data])
  const userId = userQuery.data?.id
  const workspaceId = selectedWorkspace?.id
  const runningEntryQuery = useQuery({
    enabled: Boolean(clockifyEnabled && userId && workspaceId),
    queryKey: queryKeys.clockify.runningEntry({
      params: { userId, workspaceId },
    }),
    queryFn: () =>
      clockify.getTimeEntries({
        params: { workspaceId: workspaceId!, userId: userId! },
        queries: {
          hydrated: true,
          'in-progress': 'true',
          page: 1,
          'page-size': 1,
        },
      }),
    refetchInterval: 15 * 60_000,
    staleTime: 60_000,
  })
  const runningEntry = useMemo(() => {
    const entries = runningEntryQuery.data ?? []
    return entries.find(entry => entry.userId === userId) ?? entries[0] ?? null
  }, [runningEntryQuery.data, userId])
  const syncedEntriesQuery = useLiveQuery(
    query => {
      if (!userId || !workspaceId) {
        return null
      }

      return query
        .from({ syncedEntry: clockifyTimeEntriesCollection })
        .where(({ syncedEntry }) => and(eq(syncedEntry.userId, userId), eq(syncedEntry.workspaceId, workspaceId)))
    },
    [userId, workspaceId],
  )
  const recentEntries = useMemo(
    () =>
      (syncedEntriesQuery.data ?? [])
        .filter(syncedEntry => Boolean(syncedEntry.entry.timeInterval?.end) && syncedEntry.id !== runningEntry?.id)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, recentEntryLimit),
    [runningEntry?.id, syncedEntriesQuery.data],
  )

  const openDestination = useCallback(
    async (destination: MenuBarDestination) => {
      await navigate({ to: destination })

      const window = getCurrentWindow()
      await window.show()
      await window.unminimize()
      await window.setFocus()
    },
    [navigate],
  )
  const invalidateClockifyTimerData = useCallback(() => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() }),
    ])
  }, [queryClient])
  const setMenuBarTitle = useCallback((nextTray: TrayIcon, title: string) => {
    const update = trayTitleUpdates.current.then(
      () => nextTray.setTitle(title),
      () => nextTray.setTitle(title),
    )

    trayTitleUpdates.current = update.catch(error => {
      console.warn('[menu bar] Could not update timer title:', error)
    })
  }, [])
  const { mutate: stopRunningEntry } = useMutation({
    mutationFn: stopClockifyTimeEntry,
    onError: error => {
      console.warn('[menu bar] Could not stop Clockify timer:', error)
      appToast.error('Could not stop Clockify timer', { description: getErrorMessage(error) })
    },
    onSuccess: () => {
      queryClient.setQueryData<TimeEntryWithRatesDtoV1[]>(
        queryKeys.clockify.runningEntry({ params: { userId, workspaceId } }),
        [],
      )
      if (tray) {
        setMenuBarTitle(tray, '')
      }
      void setQuickTimersActiveEntry(null)
      void invalidateClockifyTimerData()
    },
  })
  const { mutate: resumeEntry } = useMutation({
    mutationFn: resumeClockifyTimeEntry,
    onError: error => {
      console.warn('[menu bar] Could not start Clockify timer:', error)
      appToast.error('Could not start Clockify timer', { description: getErrorMessage(error) })
    },
    onSuccess: () => {
      void invalidateClockifyTimerData()
    },
  })
  const stopTimer = useCallback(() => {
    if (runningEntry) {
      stopRunningEntry(runningEntry)
    }
  }, [runningEntry, stopRunningEntry])

  useEffect(() => {
    if (!isTauri()) {
      return
    }

    let cancelled = false

    const initializeTray = async () => {
      const existingTray = await TrayIcon.getById(menuBarTrayId)
      const icon = await defaultWindowIcon()

      if (!icon) {
        throw new Error('Clockalong is missing its application icon.')
      }

      const nextTray =
        existingTray ??
        (await TrayIcon.new({
          icon,
          id: menuBarTrayId,
          showMenuOnLeftClick: true,
          tooltip: 'Clockalong',
        }))

      if (!cancelled) {
        setTray(nextTray)
      }
    }

    void initializeTray().catch(error => {
      console.warn('[menu bar] Could not initialize menu bar:', error)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!tray) {
      return
    }

    const updateTimerTitle = () => {
      setMenuBarTitle(tray, formatMenuBarTimer(runningEntry?.timeInterval?.start, Date.now()))
    }

    updateTimerTitle()

    if (!runningEntry?.timeInterval?.start) {
      return
    }

    const interval = window.setInterval(updateTimerTitle, 1_000)

    return () => window.clearInterval(interval)
  }, [runningEntry?.timeInterval?.start, setMenuBarTitle, tray])

  useEffect(() => {
    if (!tray) {
      return
    }

    void tray.setVisible(menuBarVisible).catch(error => {
      console.warn('[menu bar] Could not update menu bar visibility:', error)
    })
  }, [menuBarVisible, tray])

  useEffect(() => {
    if (!tray) {
      return
    }

    const tooltip = runningEntry
      ? `Clockalong${menuBarTitleSeparator}${getClockifyTimeEntryTitle(runningEntry)}`
      : 'Clockalong'

    void tray.setTooltip(tooltip).catch(error => {
      console.warn('[menu bar] Could not update tooltip:', error)
    })
  }, [runningEntry, tray])

  useEffect(() => {
    if (!tray) {
      return
    }

    void createMenu({
      onDashboard: () => {
        void openDestination('/dashboard')
      },
      onResume: resumeEntry,
      onSettings: () => {
        void openDestination('/settings')
      },
      onStop: stopTimer,
      recentEntries,
      runningEntry,
    })
      .then(menu => tray.setMenu(menu))
      .catch(error => {
        console.warn('[menu bar] Could not update menu:', error)
      })
  }, [openDestination, recentEntries, resumeEntry, runningEntry, stopTimer, tray])
}

function createMenu({
  onDashboard,
  onResume,
  onSettings,
  onStop,
  recentEntries,
  runningEntry,
}: {
  onDashboard: () => void
  onResume: (entry: TimeEntryWithRatesDtoV1) => void
  onSettings: () => void
  onStop: () => void
  recentEntries: SyncedClockifyTimeEntry[]
  runningEntry: TimeEntryWithRatesDtoV1 | null
}) {
  const recentEntryItems: NativeMenuItem[] = recentEntries.length
    ? recentEntries.map(syncedEntry => ({
        id: `recent-entry-${syncedEntry.id}`,
        text: truncateMenuText(getClockifyTimeEntryTitle(syncedEntry.entry)),
        action: () => {
          void onResume(syncedEntry.entry)
        },
      }))
    : [{ id: 'no-recent-entries', text: 'No recent entries', enabled: false }]
  const items: NativeMenuItem[] = [
    { id: 'recent-entries-header', text: 'Recent entries', enabled: false },
    ...(runningEntry
      ? [
          {
            id: 'stop-timer',
            text: 'Stop timer',
            action: () => {
              void onStop()
            },
          } satisfies MenuItemOptions,
        ]
      : []),
    { item: 'Separator' },
    ...recentEntryItems,
    { item: 'Separator' },
    {
      id: 'dashboard',
      text: 'Dashboard',
      action: () => {
        void onDashboard()
      },
    },
    {
      id: 'settings',
      text: 'Settings',
      action: () => {
        void onSettings()
      },
    },
    { item: 'Quit', text: 'Quit Clockalong' },
  ]

  return Menu.new({ items })
}

function formatMenuBarTimer(start: string | undefined, now: number) {
  if (!start) {
    return ''
  }

  const startTime = new Date(start).getTime()

  if (Number.isNaN(startTime)) {
    return ''
  }

  const totalSeconds = Math.max(0, Math.floor((now - startTime) / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function truncateMenuText(value: string, maxLength = 72) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}
