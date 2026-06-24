import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useState } from 'react'

type TauriReactiveStateHookOptions = {
  enabled?: boolean
}

export function createTauriReactiveStateHook<GetSnapshot extends () => Promise<unknown>>({
  browserValue,
  eventName,
  getSnapshot,
  initialValue,
  logScope,
  stateName,
}: {
  browserValue: Awaited<ReturnType<GetSnapshot>>
  eventName?: string
  getSnapshot: GetSnapshot
  initialValue: Awaited<ReturnType<GetSnapshot>>
  logScope: string
  stateName: string
}) {
  type Value = Awaited<ReturnType<GetSnapshot>>

  return function useCreatedTauriReactiveState({ enabled = true }: TauriReactiveStateHookOptions = {}) {
    const runningInTauri = isTauri()
    const [state, setState] = useState(() => ({
      value: (runningInTauri ? initialValue : browserValue) as Value,
      loading: runningInTauri && enabled,
      error: null as string | null,
    }))

    const refresh = useCallback(async () => {
      if (!isTauri()) {
        log(logScope, `${stateName}: non-Tauri runtime, using browser fallback`)
        setState({
          value: browserValue as Value,
          loading: false,
          error: null,
        })
        return
      }

      setState(current => ({
        ...current,
        loading: true,
        error: null,
      }))

      try {
        const value = (await getSnapshot()) as Value

        setState({
          value,
          loading: false,
          error: null,
        })
      } catch (error) {
        setState(current => ({
          ...current,
          loading: false,
          error: getErrorMessage(error),
        }))
      }
    }, [browserValue, getSnapshot, logScope, stateName])

    useEffect(() => {
      if (!enabled) {
        log(logScope, `${stateName}: disabled`)
        setState(current => ({
          ...current,
          loading: false,
        }))
        return
      }

      if (!isTauri()) {
        log(logScope, `${stateName}: non-Tauri runtime, skipping event subscription`)
        setState({
          value: browserValue as Value,
          loading: false,
          error: null,
        })
        return
      }

      let active = true
      let eventReceived = false
      let unlisten: (() => void) | undefined

      const initialize = async () => {
        setState(current => ({
          ...current,
          loading: true,
          error: null,
        }))

        if (eventName) {
          log(logScope, `${stateName}: subscribing to ${eventName}`)

          try {
            const nextUnlisten = await listen<Value>(eventName, event => {
              if (!active) {
                return
              }

              log(logScope, `${stateName}: received event`)
              eventReceived = true
              setState(current => ({
                ...current,
                value: event.payload,
                error: null,
              }))
            })

            if (active) {
              unlisten = nextUnlisten
            } else {
              nextUnlisten()
            }
          } catch (error) {
            if (active) {
              log(logScope, `${stateName}: event subscription failed: ${getErrorMessage(error)}`)
              setState(current => ({
                ...current,
                error: getErrorMessage(error),
              }))
            }
          }
        } else {
          log(logScope, `${stateName}: no event subscription configured`)
        }

        try {
          const value = (await getSnapshot()) as Value

          if (active) {
            log(logScope, `${stateName}: received snapshot eventReceived=${eventReceived}`)
            setState(current =>
              eventReceived ? { ...current, loading: false } : { value, loading: false, error: null },
            )
          }
        } catch (error) {
          if (active) {
            log(logScope, `${stateName}: snapshot request failed: ${getErrorMessage(error)}`)
            setState(current => ({
              ...current,
              loading: false,
              error: getErrorMessage(error),
            }))
          }
        }
      }

      void initialize()

      return () => {
        if (eventName) {
          log(logScope, `${stateName}: unsubscribing from ${eventName}`)
        }
        active = false
        unlisten?.()
      }
    }, [browserValue, enabled, eventName, getSnapshot, logScope, stateName])

    return { ...state, refresh }
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function log(scope: string, message: string) {
  console.info(`[${scope}] ${message}`)
}
