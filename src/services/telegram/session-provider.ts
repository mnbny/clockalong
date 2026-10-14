import type { TelegramChat } from './chat'
import type { PropsWithChildren } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react'

import { appToast } from '../../components/AppToaster'
import { useAppInit } from '../../hooks/useAppInit'
import { type TelegramGroupState } from './group'
import { type TelegramOperation, TelegramSession } from './session'

function useTelegramData() {
  const initialization = useAppInit()
  const query = useQueryClient()
  const [chatState, setChatState] = useState<{ chat: TelegramChat | null }>({ chat: null })
  const [operation, setOperation] = useState<TelegramOperation>('idle')
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
  const [group, setGroup] = useState<TelegramGroupState>({ group: null, status: 'none' })
  const [session] = useState(
    () => new TelegramSession(setOperation, setUnavailableReason, setGroup, query, chat => setChatState({ chat })),
  )

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
    () => ({
      connect: session.connect.bind(session),
      cancel: session.cancel.bind(session),
      connectGroup: session.connectGroup.bind(session),
      retryGroup: session.retryGroup.bind(session),
      unlinkGroup: session.unlinkGroup.bind(session),
    }),
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
    chat: chatState.chat,
    operation,
    group,
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
