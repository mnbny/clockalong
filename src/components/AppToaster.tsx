import type { ReactNode } from 'react'

import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import { toast, Toaster } from 'sonner'

type AppToastLevel = 'error' | 'info' | 'success' | 'warning'

type AppToastOptions = {
  action?: {
    label: ReactNode
    onClick: () => Promise<void> | void
  }
  description?: ReactNode
}

export function AppToaster() {
  return <Toaster position="bottom-right" visibleToasts={4} gap={10} toastOptions={{ unstyled: true }} />
}

export const appToast = {
  error: (message: ReactNode, options?: AppToastOptions) => showAppToast('error', message, options),
  info: (message: ReactNode, options?: AppToastOptions) => showAppToast('info', message, options),
  success: (message: ReactNode, options?: AppToastOptions) => showAppToast('success', message, options),
  warning: (message: ReactNode, options?: AppToastOptions) => showAppToast('warning', message, options),
}

function showAppToast(level: AppToastLevel, message: ReactNode, options?: AppToastOptions) {
  return toast.custom(toastId => (
    <div className={`alert ${getAlertClassName(level)} max-w-sm items-start shadow-lg`}>
      {getToastIcon(level)}
      <div className="min-w-0">
        <div className="text-sm leading-5 font-medium">{message}</div>
        {options?.description ? <div className="mt-1 text-xs leading-5">{options.description}</div> : null}
      </div>
      {options?.action ? (
        <button
          className="btn btn-sm ml-2"
          type="button"
          onClick={() => {
            void options.action?.onClick()
          }}>
          {options.action.label}
        </button>
      ) : null}
      <button className="btn btn-square btn-ghost btn-xs ml-auto" type="button" onClick={() => toast.dismiss(toastId)}>
        <IconX className="size-4" />
      </button>
    </div>
  ))
}

function getAlertClassName(level: AppToastLevel) {
  switch (level) {
    case 'error':
      return 'alert-error'
    case 'info':
      return 'alert-info'
    case 'success':
      return 'alert-success'
    case 'warning':
      return 'alert-warning'
  }
}

function getToastIcon(level: AppToastLevel) {
  switch (level) {
    case 'error':
      return <IconX className="size-5" />
    case 'info':
      return <IconInfoCircle className="size-5" />
    case 'success':
      return <IconCheck className="size-5" />
    case 'warning':
      return <IconAlertTriangle className="size-5" />
  }
}
