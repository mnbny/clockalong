import type { TrackedTimer } from '../services/tracking/store'

import { IconPlayerStop, IconRefresh, IconX } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { useDexieQuery } from '../hooks/useDexieQuery'
import { clockifyEntryCache } from '../services/clockify/entry-cache'
import { dismissTrackedTimer, refreshStoppedTimer, stopTrackedTimer } from '../services/tracking/coordinator'
import { describeTrackedTimer, readTrackedTimers } from '../services/tracking/store'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'

export function ConcurrentTimers({ userId }: { userId?: string }) {
  const read = useCallback(() => (userId ? readTrackedTimers(userId) : Promise.resolve([])), [userId])
  const timers = useDexieQuery(read, userId)
  const rows = useMemo(
    () =>
      timers.data?.filter(
        timer =>
          timer.mode === 'internal' && (timer.state === 'failed' || (timer.state === 'active' && !timer.endedAt)),
      ) ?? [],
    [timers.data],
  )
  if (timers.error)
    return (
      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-square btn-ghost text-error hover:bg-error/10 btn-xs"
          aria-label="Retry loading concurrent timers"
          onClick={timers.retry}>
          <IconRefresh className="size-4" />
        </button>
      </div>
    )
  if (!rows.length) return null
  return (
    <ul aria-label="Concurrent timers" className="divide-base-content/10 border-base-content/10 mt-2 divide-y border-t">
      {rows.map(timer => (
        <ConcurrentTimerRow key={timer.timerId} timer={timer} />
      ))}
    </ul>
  )
}

function ConcurrentTimerRow({ timer }: { timer: TrackedTimer }) {
  const [now, setNow] = useState(Date.now)
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const dismissDialogRef = useRef<HTMLDialogElement>(null)
  const dismissTitleId = useId()
  useEffect(() => {
    if (confirmDismiss) dismissDialogRef.current?.showModal()
  }, [confirmDismiss])
  useEffect(() => {
    if (timer.endedAt) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [timer.endedAt])
  const seconds = describeTrackedTimer(timer, now).elapsedSeconds
  const elapsed = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const save = useMutation({
    mutationFn: (retry: boolean) => stopTrackedTimer(timer.timerId, retry),
    onMutate: () => clockifyEntryCache.getLifecycle(),
    onSuccess: (entry, _retry, lifecycle) => refreshStoppedTimer(entry, lifecycle),
  })
  const dismiss = useMutation({
    mutationFn: () => dismissTrackedTimer(timer.timerId),
    onError: error => appToast.error('Could not dismiss timer', { description: getErrorMessage(error) }),
  })
  const failed = timer.state === 'failed' || save.isError
  const busy = save.isPending || dismiss.isPending || timer.state === 'saving' || timer.state === 'starting'
  const title = timer.body.description || 'Untitled timer'
  if (save.isPending) return null
  return (
    <li className="py-2 text-sm" data-timer-id={timer.timerId}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate" title={title}>
            {title}
          </div>
          {!!timer.callerId && <div className="text-base-content/60 truncate text-xs">{timer.callerId}</div>}
        </div>
        <span className={`font-mono tabular-nums ${failed ? 'text-warning' : ''}`}>{elapsed}</span>
        {(failed || !timer.endedAt) && (
          <button
            type="button"
            className={`btn btn-square btn-ghost btn-xs ${failed ? 'text-warning hover:bg-warning/10' : 'text-error hover:bg-error/10'}`}
            aria-label={`${failed ? 'Retry saving' : 'Stop'} ${title}`}
            disabled={busy}
            onClick={() => save.mutate(failed)}>
            {failed ? <IconRefresh className="size-4" /> : <IconPlayerStop className="size-4" />}
          </button>
        )}
        {timer.state === 'failed' && (
          <button
            type="button"
            className="btn btn-square btn-ghost text-error hover:bg-error/10 btn-xs"
            aria-label={`Dismiss ${title}`}
            aria-haspopup="dialog"
            title="Dismiss timer"
            disabled={busy}
            onClick={() => setConfirmDismiss(true)}>
            <IconX className="size-4" />
          </button>
        )}
      </div>
      {timer.state === 'failed' && confirmDismiss && (
        <dialog
          ref={dismissDialogRef}
          className="modal"
          aria-labelledby={dismissTitleId}
          onClose={() => setConfirmDismiss(false)}
          onCancel={event => {
            if (busy) event.preventDefault()
          }}>
          <div className="modal-box grid max-w-lg gap-5 rounded-lg">
            <div className="grid gap-1">
              <h3 id={dismissTitleId} className="text-lg leading-7 font-semibold">
                Dismiss internal timer?
              </h3>
              <p className="text-base-content/60 text-sm">
                {timer.uncertain
                  ? 'This time may already be in Clockify. Dismiss only removes it from Clockalong.'
                  : 'This discards the unsaved time. Nothing will be added to Clockify.'}
              </p>
            </div>
            <div className="grid gap-1">
              <p className="text-sm wrap-anywhere">{title}</p>
              <p className="text-base-content/60 text-xs tabular-nums">{elapsed}</p>
            </div>
            <div className="modal-action mt-0">
              <button
                className="btn btn-ghost"
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setConfirmDismiss(false)}>
                Cancel
              </button>
              <button className="btn btn-error" type="button" disabled={busy} onClick={() => dismiss.mutate()}>
                {dismiss.isPending && <span className="loading loading-spinner loading-xs" />}
                {dismiss.isPending ? 'Dismissing…' : 'Dismiss timer'}
              </button>
            </div>
          </div>
          <button
            className="modal-backdrop"
            type="button"
            aria-label="Cancel dismissal"
            disabled={busy}
            onClick={() => setConfirmDismiss(false)}
          />
        </dialog>
      )}
    </li>
  )
}
