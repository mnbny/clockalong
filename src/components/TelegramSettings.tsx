import { useRef } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { useTelegram } from '../services/telegram/session-provider'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'
import { TelegramAuthDialog, type TelegramAuthDialogHandle } from './TelegramAuthDialog'

export function TelegramSettings() {
  const auth = useAppAuth()
  const telegram = useTelegram()
  const dialog = useRef<TelegramAuthDialogHandle>(null)
  return (
    <SettingsSection title="Telegram">
      <SettingsRow label="Connection" description={telegram.unavailableReason ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {auth.value.telegramAuthenticated ? (
            <span className="text-success text-sm">Connected</span>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={telegram.busy || !!telegram.unavailableReason}
              onClick={() => dialog.current?.open()}>
              {telegram.busy && <span className="loading loading-spinner loading-xs" />}
              Connect / Retry
            </button>
          )}
          <button className="btn btn-ghost btn-sm" disabled={telegram.busy} onClick={() => void telegram.disconnect()}>
            Disconnect
          </button>
        </div>
      </SettingsRow>
      <TelegramAuthDialog ref={dialog} />
    </SettingsSection>
  )
}
