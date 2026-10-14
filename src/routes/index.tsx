import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useAppInit } from '../hooks/useAppInit'

export const Route = createFileRoute('/')({
  component: IndexScreen,
})

const MINIMUM_LOADER_MS = 700

function IndexScreen() {
  const initialization = useAppInit()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), MINIMUM_LOADER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (!ready || initialization.value.appInitializing) {
    return (
      <section className="grid h-full place-items-center">
        <span className="loading loading-ring text-primary size-16" />
      </section>
    )
  }

  return <Navigate to="/dashboard" replace />
}
