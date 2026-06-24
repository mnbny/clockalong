import type { UnlistenFn } from '@tauri-apps/api/event'

import { isTauri } from '@tauri-apps/api/core'
import { Store, type StoreOptions } from '@tauri-apps/plugin-store'

export type StorageConfig = Record<string, { type: StorageValueType; default: unknown; version?: string | number }>

type StorageValueType = 'object' | 'string' | 'boolean' | 'number'
type StorageMetadata = Record<string, string | number>
export type StorageKey<S extends StorageConfig> = Extract<keyof S, string>
export type StorageValue<S extends StorageConfig, K extends StorageKey<S>> = S[K]['default']
export type StorageSetterValue<S extends StorageConfig, K extends StorageKey<S>> =
  | StorageValue<S, K>
  | StorageUpdater<S, K>
type StorageUpdater<S extends StorageConfig, K extends StorageKey<S>> = (
  current: StorageValue<S, K>,
) => StorageValue<S, K> | Promise<StorageValue<S, K>>

export class StorageService<T extends StorageConfig> {
  config: T = {} as T

  private path: string
  private options?: StoreOptions
  private storePromise?: Promise<Store | null>

  constructor(config: T, path: string, options?: StoreOptions) {
    this.config = config
    this.path = path
    this.options = options
  }

  init = async (): Promise<void> => {
    await this.getStore()
  }

  get = async <K extends StorageKey<typeof this.config>>(key: K): Promise<StorageValue<typeof this.config, K>> => {
    type Value = StorageValue<typeof this.config, K>
    const defaultValue = this.config[key]?.default as Value

    try {
      const store = await this.getStore()

      if (!store) {
        return defaultValue
      }

      const value = await store.get<Value>(key)
      return value ?? defaultValue
    } catch (error) {
      console.warn(`[storage] Error retrieving value for key ${String(key)}:`, error)
      return defaultValue
    }
  }

  set = async <K extends StorageKey<typeof this.config>>(
    key: K,
    value: StorageSetterValue<typeof this.config, K>,
  ): Promise<void> => {
    try {
      const store = await this.getStore()

      if (!store) {
        return
      }

      const nextValue =
        typeof value === 'function'
          ? await (value as StorageUpdater<typeof this.config, K>)(await this.get(key))
          : value

      if (nextValue === null || nextValue === undefined) {
        await store.delete(key)
      } else {
        await store.set(key, nextValue)
      }

      await store.save()
    } catch (error) {
      console.warn(`[storage] Error setting value for key ${String(key)}:`, error)
    }
  }

  remove = async <K extends StorageKey<typeof this.config>>(key: K): Promise<void> => {
    try {
      const store = await this.getStore()

      if (!store) {
        return
      }

      await store.delete(key)
      await store.save()
    } catch (error) {
      console.warn(`[storage] Error removing value for key ${String(key)}:`, error)
    }
  }

  clear = async (): Promise<void> => {
    try {
      const store = await this.getStore()

      if (!store) {
        return
      }

      await store.clear()
      await store.save()
    } catch (error) {
      console.warn('[storage] Error clearing storage:', error)
    }
  }

  onKeyChange = async <K extends StorageKey<typeof this.config>>(
    key: K,
    callback: (value: StorageValue<typeof this.config, K> | undefined) => void,
  ): Promise<UnlistenFn | undefined> => {
    const store = await this.getStore()
    return store?.onKeyChange<StorageValue<typeof this.config, K>>(key, callback)
  }

  private getStore = async (): Promise<Store | null> => {
    if (!isTauri()) {
      return null
    }

    this.storePromise ??= Store.load(this.path, this.options).then(async store => {
      await this.validateAndMigrateVersions(store)
      return store
    })

    return this.storePromise
  }

  private validateAndMigrateVersions = async (store: Store): Promise<void> => {
    const metadata = (await store.get<StorageMetadata>('__storage_metadata')) ?? {}
    let changed = false

    for (const [key, config] of Object.entries(this.config)) {
      if (config.version === undefined) {
        continue
      }

      if (metadata[key] !== config.version) {
        await store.delete(key)
        metadata[key] = config.version
        changed = true
      }
    }

    if (changed) {
      await store.set('__storage_metadata', metadata)
      await store.save()
    }
  }
}
