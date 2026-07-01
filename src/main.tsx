import { QueryClientProvider } from '@tanstack/react-query'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

import { registerConsoleLogging } from './lib/logging'
import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
import { ClockifySyncProvider } from './services/clockify/sync'
import { LinearSyncProvider } from './services/linear/sync'
import { ProviderRegistry } from './utils/provider-registry'

import './styles.css'

registerConsoleLogging()

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ProviderRegistry
    registry={{ ClockifySyncProvider, LinearSyncProvider, QueryClientProvider }}
    providers={['QueryClientProvider', 'LinearSyncProvider', 'ClockifySyncProvider']}
    QueryClientProviderProps={{ client: queryClient }}>
    <RouterProvider router={router} />
  </ProviderRegistry>,
)
