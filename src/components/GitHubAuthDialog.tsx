import { IconExternalLink } from '@tabler/icons-react'
import { type FormEvent, type ForwardedRef, forwardRef, useState } from 'react'

import { auth } from '../services/tauri/auth-client'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'

type GitHubAuthDialogProps = {
  onConnected?: () => void
  onPendingChange?: (pending: boolean) => void
}

export const GitHubAuthDialog = forwardRef<HTMLDialogElement, GitHubAuthDialogProps>(function GitHubAuthDialog(
  { onConnected, onPendingChange },
  ref,
) {
  const [accessToken, setAccessToken] = useState('')
  const [connecting, setConnecting] = useState(false)

  const connectGithub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    githubDialogLog(`connectGithub: submitting token_len=${accessToken.trim().length}`)
    setConnecting(true)
    onPendingChange?.(true)

    try {
      await auth.connectGithub(accessToken)
      githubDialogLog('connectGithub: connected')
      appToast.success('GitHub connected.')
      closeDialog(ref)
      setAccessToken('')
      onConnected?.()
    } catch (error) {
      githubDialogLog(`connectGithub: failed=${getErrorMessage(error)}`)
      appToast.error('Could not connect GitHub.', {
        description: getErrorMessage(error),
      })
    } finally {
      setConnecting(false)
      onPendingChange?.(false)
    }
  }

  return (
    <dialog ref={ref} className="modal" onClose={() => setAccessToken('')}>
      <div className="modal-box max-w-md rounded-lg">
        <form className="grid gap-5" onSubmit={event => void connectGithub(event)}>
          <div className="grid gap-2">
            <h3 className="text-lg leading-7 font-semibold">Connect GitHub</h3>
            <a
              className="link link-primary inline-flex w-fit items-center gap-1 text-sm"
              href="https://github.com/settings/personal-access-tokens/new"
              rel="noreferrer"
              target="_blank">
              Create fine-grained token
              <IconExternalLink className="size-4" />
            </a>
            <div className="text-base-content/70 grid gap-2 text-sm leading-6">
              <p>Create a fine-grained token for the repositories you want to track.</p>
              <div>
                <p>Recommended repository permissions:</p>
                <ul className="list-disc pl-5">
                  <li>Metadata: read</li>
                  <li>Issues: read</li>
                  <li>Pull requests: read</li>
                </ul>
              </div>
              <p>
                Clockalong stores the token in native secure storage on this device and only uses it to read GitHub data
                for this app. You can revoke it any time in GitHub settings.
              </p>
            </div>
          </div>

          <label className="form-control grid gap-2">
            <span className="label-text text-sm font-medium">Access token</span>
            <input
              autoComplete="off"
              autoFocus
              className="input input-bordered w-full font-mono text-sm"
              disabled={connecting}
              spellCheck={false}
              type="text"
              value={accessToken}
              onChange={event => setAccessToken(event.target.value)}
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

function githubDialogLog(message: string) {
  console.info(`[github auth dialog] ${message}`)
}
