import type { SavedTelegramGroup } from '../telegram/group'

import { invoke } from '@tauri-apps/api/core'

export const telegramGroup = {
  read: () => invoke<SavedTelegramGroup | null>('telegram_group_read'),
  save: (group: SavedTelegramGroup) => invoke<void>('telegram_group_save', { group }),
  remove: () => invoke<void>('telegram_group_remove'),
}
