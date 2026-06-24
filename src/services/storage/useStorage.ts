import type { StorageConfig, StorageKey, StorageSetterValue, StorageValue } from './storage'

import { useCallback, useEffect, useState } from 'react'

import { storage } from './config'

export function useStorage<K extends StorageKey<typeof storage.config>>(
  key: K,
): [
  StorageValue<typeof storage.config, K>,
  (value: StorageSetterValue<typeof storage.config, K>) => Promise<void>,
  () => Promise<void>,
] {
  type Value = StorageValue<typeof storage.config, K>
  const defaultValue = storage.config[key]?.default as Value
  const [value, setValue] = useState<Value>(defaultValue)

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    storage
      .get(key)
      .then(storedValue => {
        if (!cancelled) {
          setValue(storedValue)
        }
      })
      .catch(error => {
        console.warn(`[storage hook] Error loading storage value for key ${String(key)}:`, error)
      })

    storage
      .onKeyChange(key, nextValue => {
        if (!cancelled) {
          setValue(nextValue ?? defaultValue)
        }
      })
      .then(nextUnlisten => {
        unlisten = nextUnlisten
      })
      .catch(error => {
        console.warn(`[storage hook] Error subscribing to storage value for key ${String(key)}:`, error)
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [defaultValue, key])

  const setStoredValue = useCallback(
    async (next: StorageSetterValue<typeof storage.config, K>) => {
      const nextValue =
        typeof next === 'function'
          ? await (
              next as (
                current: StorageValue<typeof storage.config, K>,
              ) => StorageValue<typeof storage.config, K> | Promise<StorageValue<typeof storage.config, K>>
            )(await storage.get(key))
          : next

      await storage.set(key, nextValue)
      setValue(nextValue ?? defaultValue)
    },
    [defaultValue, key],
  )

  const reset = useCallback(async () => {
    await storage.remove(key)
    setValue(defaultValue)
  }, [defaultValue, key])

  return [value, setStoredValue, reset]
}

export type UseStorageConfig = StorageConfig
