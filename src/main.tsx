import { QueryClientProvider } from '@tanstack/react-query'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
import { initializeConsoleLogging } from './utils/console-logging'
import { ProviderRegistry } from './utils/provider-registry'

import './styles.css'

initializeConsoleLogging()

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
    registry={{ QueryClientProvider }}
    providers={['QueryClientProvider']}
    QueryClientProviderProps={{ client: queryClient }}>
    <RouterProvider router={router} />
  </ProviderRegistry>,
)
