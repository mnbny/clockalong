import type { TelegramLoginView } from '../services/telegram/session'

import { QRCodeSVG } from 'qrcode.react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { useTelegram } from '../services/telegram/session-provider'
import { appToast } from './AppToaster'

export type TelegramAuthDialogHandle = { open: () => void }

export const TelegramAuthDialog = forwardRef<TelegramAuthDialogHandle>(function TelegramAuthDialog(_, ref) {
  const { connect, cancel, operation } = useTelegram()
  const dialog = useRef<HTMLDialogElement>(null)
  const passwordPrompt = useRef<{ resolve: (password: string) => void; reject: () => void } | null>(null)
  const [view, setView] = useState<TelegramLoginView>({ step: 'waiting' })
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)

  const clearPasswordPrompt = () => {
    passwordPrompt.current?.reject()
    passwordPrompt.current = null
  }

  useEffect(
    () => () => {
      clearPasswordPrompt()
      cancel()
    },
    [cancel],
  )

  const close = () => {
    if (!cancel()) return
    clearPasswordPrompt()
    setPassword('')
    setView({ step: 'waiting' })
    dialog.current?.close()
  }

  const start = async () => {
    setFailed(false)
    setView({ step: 'waiting' })
    try {
      const connected = await connect({
        show: setView,
        password: () => {
          setView({ step: 'password' })
          return new Promise<string>((resolve, reject) => {
            passwordPrompt.current = { resolve, reject: () => reject(new Error('Cancelled')) }
          })
        },
        invalidPassword: () => appToast.error('Incorrect Telegram password. Try again.'),
      })
      if (connected) appToast.success('Telegram connected.')
      dialog.current?.close()
    } catch (error) {
      // The service only returns fixed, safe messages; never render raw Telegram errors.
      appToast.error(error instanceof Error ? error.message : 'Could not connect Telegram.')
      setFailed(true)
    } finally {
      clearPasswordPrompt()
      setPassword('')
      setView({ step: 'waiting' })
    }
  }

  useImperativeHandle(ref, () => ({
    open: () => {
      dialog.current?.showModal()
      void start()
    },
  }))

  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={event => {
        event.preventDefault()
        close()
      }}>
      <div className="modal-box max-w-md rounded-lg">
        <h3 className="mb-5 text-lg leading-7 font-semibold">Connect Telegram</h3>
        {failed ? (
          <p className="text-base-content/70 text-sm leading-6">
            Connection did not finish. Try again when you are ready.
          </p>
        ) : view.step === 'qr' ? (
          <div className="grid justify-items-center gap-4">
            <QRCodeSVG value={view.url} size={224} marginSize={4} title="Telegram login QR code" />
            <p className="text-base-content/70 text-sm leading-6">
              On your phone, open Telegram → Settings → Devices → Link Desktop Device.
            </p>
          </div>
        ) : view.step === 'password' ? (
          <form
            className="grid gap-5"
            onSubmit={event => {
              event.preventDefault()
              const prompt = passwordPrompt.current
              passwordPrompt.current = null
              prompt?.resolve(password)
              setPassword('')
              setView({ step: 'waiting' })
            }}>
            <p id="telegram-password-help" className="text-base-content/70 text-sm leading-6">
              Enter the password you set in Telegram under Settings → Privacy and Security → Two-Step Verification.
            </p>
            <label className="form-control grid gap-2">
              <span className="label-text text-sm font-medium">Telegram password</span>
              <input
                autoFocus
                autoComplete="off"
                aria-describedby="telegram-password-help"
                type="password"
                className="input input-bordered w-full text-sm"
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </label>
            <button className="btn btn-primary" disabled={!password} type="submit">
              Continue
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-3 text-sm" role="status">
            <span className="loading loading-spinner loading-sm" />
            {view.step === 'saving' ? 'Saving connection…' : 'Connecting to Telegram…'}
          </div>
        )}
        <div className="modal-action">
          <button className="btn btn-ghost" disabled={operation === 'saving'} type="button" onClick={close}>
            Cancel
          </button>
          {failed && (
            <button className="btn btn-primary" type="button" onClick={() => void start()}>
              Retry
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
})
