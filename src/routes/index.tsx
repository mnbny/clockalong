import { createFileRoute, Navigate } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'

import { appInitializationStateChangedEvent, getAppInitializationState } from '../hooks/useTauriAppInitializationState'

export const Route = createFileRoute('/')({
  component: IndexScreen,
})

const MINIMUM_LOADER_MS = 700

function IndexScreen() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    const minimumDelay = new Promise<void>(resolve => {
      window.setTimeout(resolve, MINIMUM_LOADER_MS)
    })

    const initializationDone = (async () => {
      const initial = await getAppInitializationState()
      if (!initial.appInitializing) {
        return
      }

      await new Promise<void>(resolve => {
        void listen<{ appInitializing: boolean }>(appInitializationStateChangedEvent, event => {
          if (!event.payload.appInitializing) {
            resolve()
          }
        }).then(nextUnlisten => {
          if (cancelled) {
            nextUnlisten()
            return
          }
          unlisten = nextUnlisten
        })
      })
    })()

    void Promise.all([minimumDelay, initializationDone]).then(() => {
      if (!cancelled) {
        setReady(true)
      }
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  if (!ready) {
    return (
      <section className="grid h-full place-items-center">
        <span className="loading loading-ring text-primary size-16" />
      </section>
    )
  }

  return <Navigate to="/dashboard" replace />
}
