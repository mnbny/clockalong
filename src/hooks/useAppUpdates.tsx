import { Link } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

import { appToast } from '../components/AppToaster'
import { appUpdates, type AppUpdate } from '../services/tauri/appUpdates'
import { getErrorMessage } from '../utils/errors'

const INITIAL_UPDATE_CHECK_DELAY_MS = 10_000
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function useAppUpdates() {
  useEffect(() => {
    if (!isTauri()) {
      return
    }

    let active = true
    let notifiedVersion: string | null = null

    const checkForUpdates = async () => {
      try {
        const update = await appUpdates.check()

        if (!active || !update || update.version === notifiedVersion) {
          return
        }

        notifiedVersion = update.version
        showUpdateToast(update)
      } catch (error) {
        console.info('[app updates] update check failed', error)
      }
    }

    const initialCheck = window.setTimeout(() => {
      void checkForUpdates()
    }, INITIAL_UPDATE_CHECK_DELAY_MS)

    const interval = window.setInterval(() => {
      void checkForUpdates()
    }, UPDATE_CHECK_INTERVAL_MS)

    return () => {
      active = false
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
    }
  }, [])
}

function showUpdateToast(update: AppUpdate) {
  appToast.info(`Clinear ${update.version} is available`, {
    action: {
      label: 'Install',
      onClick: installUpdate,
    },
    description: <Link to="/settings">Open Settings</Link>,
  })
}

async function installUpdate() {
  try {
    await appUpdates.install()
    appToast.success('Update installed', {
      action: {
        label: 'Restart',
        onClick: appUpdates.relaunch,
      },
      description: 'Restart Clinear to finish.',
    })
  } catch (error) {
    appToast.error('Could not install update', {
      description: getErrorMessage(error),
    })
  }
}
