import type { PropsWithChildren } from 'react'

import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

import { appToast } from '../../components/AppToaster'
import { useAppInit } from '../../hooks/useAppInit'
import { type TelegramOperation, TelegramSession } from './session'

function useTelegramData() {
  const initialization = useAppInit()
  const [operation, setOperation] = useState<TelegramOperation>('idle')
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
  const [session] = useState(() => new TelegramSession(setOperation, setUnavailableReason))

  useEffect(() => {
    if (initialization.value.appInitializing) return
    void session.restore().catch(() => {
      appToast.error('Could not restore Telegram.', {
        description: 'Connect to retry, or Disconnect in Settings to remove the saved session.',
      })
    })
    const dispose = () => session.dispose()
    window.addEventListener('beforeunload', dispose)
    return () => {
      window.removeEventListener('beforeunload', dispose)
      dispose()
    }
  }, [initialization.value.appInitializing, session])

  const actions = useMemo(
    () => ({ connect: session.connect.bind(session), cancel: session.cancel.bind(session) }),
    [session],
  )

  const disconnect = async () => {
    try {
      const revoked = await session.disconnect()
      appToast.success('Telegram disconnected.', {
        description: revoked
          ? undefined
          : 'Local session removed. You can also terminate Clockalong in Telegram Settings → Devices.',
      })
    } catch {
      appToast.error('Could not remove the saved Telegram session. Try Disconnect again.')
    }
  }

  return {
    operation,
    unavailableReason,
    busy: operation !== 'idle' || initialization.value.appInitializing,
    ...actions,
    disconnect,
  }
}

type TelegramContext = ReturnType<typeof useTelegramData>
const TelegramContext = createContext<TelegramContext | null>(null)

export function TelegramSessionProvider({ children }: PropsWithChildren) {
  const data = useTelegramData()
  return createElement(TelegramContext.Provider, { value: data }, children)
}

export function useTelegram() {
  const context = useContext(TelegramContext)
  if (!context) throw new Error('useTelegram must be used within a TelegramSessionProvider')
  return context
}
