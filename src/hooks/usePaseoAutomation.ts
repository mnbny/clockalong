import { useQuery } from '@tanstack/react-query'
import { isTauri } from '@tauri-apps/api/core'
import { liveQuery } from 'dexie'
import { useEffect } from 'react'

import { queryKeys } from '../lib/query-client'
import { db } from '../services/db'
import { dispatchPaseoRuns } from '../services/paseo/automation'
import { storage } from '../services/storage/config'
import { paseo } from '../services/tauri/paseo-client'

export function usePaseoStatus() {
  return useQuery({
    queryKey: queryKeys.paseo.status,
    queryFn: paseo.detect,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })
}

export function usePaseoAutomation(scope: string | undefined, ready: boolean) {
  usePaseoStatus()
  useEffect(() => {
    if (!scope || !ready || !isTauri()) return
    let active = true
    let unlisten: (() => void) | undefined
    const drain = () => {
      void dispatchPaseoRuns(scope, () => active).catch(() => {
        console.warn('[paseo] Could not process saved trigger executions.')
      })
    }
    const subscription = liveQuery(() => db.paseoRuns.where('status').equals('pending').count()).subscribe({
      next: drain,
      error: () => {},
    })
    void storage.onKeyChange('paseoTriggers', drain).then(off => {
      if (active) unlisten = off
      else off?.()
    })
    const timer = setInterval(drain, 15_000)
    drain()
    return () => {
      active = false
      clearInterval(timer)
      subscription.unsubscribe()
      unlisten?.()
    }
  }, [scope, ready])
}
