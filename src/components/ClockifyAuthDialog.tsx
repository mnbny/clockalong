import { IconExternalLink } from '@tabler/icons-react'
import { type FormEvent, type ForwardedRef, forwardRef, useState } from 'react'

import { auth } from '../services/tauri/auth-client'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'

type ClockifyAuthDialogProps = {
  onConnected?: () => void
  onPendingChange?: (pending: boolean) => void
}

export const ClockifyAuthDialog = forwardRef<HTMLDialogElement, ClockifyAuthDialogProps>(function ClockifyAuthDialog(
  { onConnected, onPendingChange },
  ref,
) {
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)

  const connectClockify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clockifyDialogLog(`connectClockify: submitting key_len=${apiKey.trim().length}`)
    setConnecting(true)
    onPendingChange?.(true)

    try {
      await auth.connectClockify(apiKey)
      clockifyDialogLog('connectClockify: connected')
      appToast.success('Clockify connected.')
      closeDialog(ref)
      setApiKey('')
      onConnected?.()
    } catch (error) {
      clockifyDialogLog(`connectClockify: failed=${getErrorMessage(error)}`)
      appToast.error('Could not connect Clockify.', {
        description: getErrorMessage(error),
      })
    } finally {
      setConnecting(false)
      onPendingChange?.(false)
    }
  }

  return (
    <dialog ref={ref} className="modal" onClose={() => setApiKey('')}>
      <div className="modal-box max-w-md rounded-lg">
        <form className="grid gap-5" onSubmit={event => void connectClockify(event)}>
          <div className="grid gap-2">
            <h3 className="text-lg leading-7 font-semibold">Connect Clockify</h3>
            <a
              className="link link-primary inline-flex w-fit items-center gap-1 text-sm"
              href="https://app.clockify.me/manage-api-keys"
              rel="noreferrer"
              target="_blank">
              Find your API key
              <IconExternalLink className="size-4" />
            </a>
            <p className="text-base-content/70 text-sm leading-6">
              Clockalong needs your API key to read your Clockify workspaces, start and stop timers, and review time
              entries. The key is stored in native secure storage on this device and is only used for Clockify requests
              from this app. You can revoke it any time in Clockify.
            </p>
          </div>

          <label className="form-control grid gap-2">
            <span className="label-text text-sm font-medium">API key</span>
            <input
              autoComplete="off"
              autoFocus
              className="input input-bordered w-full font-mono text-sm"
              disabled={connecting}
              spellCheck={false}
              type="text"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
            />
          </label>

          <div className="modal-action mt-0">
            <button className="btn btn-ghost" disabled={connecting} type="button" onClick={() => closeDialog(ref)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={connecting} type="submit">
              {connecting ? <span className="loading loading-spinner loading-sm" /> : null}
              Connect
            </button>
          </div>
        </form>
      </div>

      <form className="modal-backdrop" method="dialog">
        <button>close</button>
      </form>
    </dialog>
  )
})

function closeDialog(ref: ForwardedRef<HTMLDialogElement>) {
  if (typeof ref === 'function') {
    return
  }

  ref?.current?.close()
}

function clockifyDialogLog(message: string) {
  console.info(`[clockify auth dialog] ${message}`)
}
