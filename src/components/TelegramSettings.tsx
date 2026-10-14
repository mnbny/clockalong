import { IconBrandTelegram, IconLink, IconLinkOff, IconLogout, IconRefresh } from '@tabler/icons-react'
import { useRef, useState } from 'react'

import { useAppAuth } from '../hooks/useAppAuth'
import { useTelegram } from '../services/telegram/session-provider'
import { appToast } from './AppToaster'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'
import { TelegramAuthDialog, type TelegramAuthDialogHandle } from './TelegramAuthDialog'

export function TelegramSettings() {
  const auth = useAppAuth()
  const telegram = useTelegram()
  const dialog = useRef<TelegramAuthDialogHandle>(null)
  const [link, setLink] = useState('')
  const group = telegram.group
  const ready = auth.value.telegramAuthenticated && !telegram.busy && !telegram.unavailableReason
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      appToast.error(error instanceof Error ? error.message : 'Could not update the group. Try again.')
    }
  }
  return (
    <SettingsSection title="Telegram">
      <SettingsRow label="Connection" description={telegram.unavailableReason ?? undefined}>
        <div className="flex flex-wrap items-center gap-2">
          {auth.value.telegramAuthenticated ? (
            <span className="badge badge-success">Connected</span>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={telegram.busy || !!telegram.unavailableReason}
              type="button"
              onClick={() => dialog.current?.open()}>
              {telegram.busy ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <IconBrandTelegram className="size-4" />
              )}
              Connect Telegram
            </button>
          )}
          <button
            className="btn btn-error btn-sm"
            disabled={telegram.busy}
            type="button"
            onClick={() => void telegram.disconnect()}>
            {telegram.operation === 'disconnecting' ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <IconLogout className="size-4" />
            )}
            Disconnect
          </button>
        </div>
      </SettingsRow>
      <SettingsRow
        label="Group"
        description={group.status === 'none' ? 'Paste an invite link for a group you already belong to.' : group.error}>
        <div className="flex w-full min-w-0 flex-col gap-3">
          {group.status === 'none' && (
            <form
              className="flex w-full min-w-0 flex-wrap items-center gap-2"
              onSubmit={event => {
                event.preventDefault()
                void run(async () => {
                  await telegram.connectGroup(link)
                  setLink('')
                })
              }}>
              <input
                aria-label="Telegram group invite link"
                autoComplete="off"
                className="input input-primary input-sm w-full max-w-xs font-mono text-sm"
                placeholder="https://t.me/+…"
                disabled={!ready}
                spellCheck={false}
                type="text"
                value={link}
                onChange={event => setLink(event.target.value)}
              />
              <button className="btn btn-primary btn-sm" disabled={!ready || !link.trim()} type="submit">
                {telegram.busy ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <IconLink className="size-4" />
                )}
                Connect group
              </button>
            </form>
          )}
          {group.status !== 'none' && (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {group.group && <span className="text-sm leading-6">{group.group.title}</span>}
                {group.status === 'connected' ? (
                  <span className="badge badge-success">Connected</span>
                ) : (
                  <span className="badge badge-error">Unavailable</span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {group.group && <code className="bg-base-200 rounded px-2 py-1 text-xs">{group.group.id}</code>}
                {group.status === 'unavailable' && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!ready}
                    type="button"
                    onClick={() => void run(telegram.retryGroup)}>
                    {telegram.busy ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <IconRefresh className="size-4" />
                    )}
                    Retry
                  </button>
                )}
                <button
                  className="btn btn-error btn-sm"
                  disabled={telegram.busy}
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await telegram.unlinkGroup()
                      setLink('')
                    })
                  }>
                  <IconLinkOff className="size-4" />
                  Unlink group
                </button>
              </div>
            </>
          )}
        </div>
      </SettingsRow>
      <TelegramAuthDialog ref={dialog} />
    </SettingsSection>
  )
}
