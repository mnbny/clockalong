import { isTauri } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'

export type AppUpdate = {
  body?: string
  currentVersion: string
  date?: string
  version: string
}

export type AppUpdateDownloadProgress = {
  downloadedBytes: number
  totalBytes?: number
}

let currentUpdate: Update | null = null

export const appUpdates = {
  check: async (): Promise<AppUpdate | null> => {
    if (!isTauri()) {
      return null
    }

    const update = await check()
    currentUpdate?.close()
    currentUpdate = update

    return update ? toAppUpdate(update) : null
  },
  install: async (onProgress?: (progress: AppUpdateDownloadProgress) => void) => {
    if (!currentUpdate) {
      throw new Error('No app update is ready to install.')
    }

    let downloadedBytes = 0
    let totalBytes: number | undefined

    await currentUpdate.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case 'Started':
          downloadedBytes = 0
          totalBytes = event.data.contentLength
          onProgress?.({ downloadedBytes, totalBytes })
          break
        case 'Progress':
          downloadedBytes += event.data.chunkLength
          onProgress?.({ downloadedBytes, totalBytes })
          break
        case 'Finished':
          onProgress?.({ downloadedBytes: totalBytes ?? downloadedBytes, totalBytes })
          break
      }
    })
  },
  relaunch,
}

function toAppUpdate(update: Update): AppUpdate {
  return {
    body: update.body,
    currentVersion: update.currentVersion,
    date: update.date,
    version: update.version,
  }
}
