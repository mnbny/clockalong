import { QueryClientProvider } from '@tanstack/react-query'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'

import { registerConsoleLogging } from './lib/logging'
import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
import { ClockifySyncProvider } from './services/clockify/sync'
import { GithubSyncProvider } from './services/github/sync'
import { LinearSyncProvider } from './services/linear/sync'
import { storage } from './services/storage/config'
import { applyTheme, resolveTheme } from './services/theme'
import { ThemeProvider } from './services/theme-provider'
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

async function startApp() {
  const initialTheme = resolveTheme(await storage.get('theme'))
  await applyTheme(initialTheme)

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <ProviderRegistry
      registry={{ ThemeProvider, ClockifySyncProvider, GithubSyncProvider, LinearSyncProvider, QueryClientProvider }}
      providers={[
        'ThemeProvider',
        'QueryClientProvider',
        'LinearSyncProvider',
        'GithubSyncProvider',
        'ClockifySyncProvider',
      ]}
      ThemeProviderProps={{ initialTheme }}
      QueryClientProviderProps={{ client: queryClient }}>
      <RouterProvider router={router} />
    </ProviderRegistry>,
  )
}

void startApp()
