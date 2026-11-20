import type { TrackedTimer } from '../services/tracking/store'

import { IconPlayerStop, IconRefresh } from '@tabler/icons-react'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useDexieQuery } from '../hooks/useDexieQuery'
import { clockifyEntryCache } from '../services/clockify/entry-cache'
import { refreshStoppedTimer, stopTrackedTimer } from '../services/tracking/coordinator'
import { describeTrackedTimer, readTrackedTimers } from '../services/tracking/store'

export function ConcurrentTimers({ userId }: { userId?: string }) {
  const read = useCallback(() => (userId ? readTrackedTimers(userId) : Promise.resolve([])), [userId])
  const timers = useDexieQuery(read, userId)
  const rows = useMemo(
    () =>
      timers.data?.filter(
        timer => timer.state === 'failed' || (timer.mode === 'internal' && timer.state === 'active' && !timer.endedAt),
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
  const failed = timer.state === 'failed' || save.isError
  const busy = save.isPending || timer.state === 'saving' || timer.state === 'starting'
  const title = timer.body.description || 'Untitled timer'
  if (save.isPending) return null
  return (
    <li className="py-2 text-sm" data-timer-id={timer.timerId}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate" title={title}>
            {title}
          </div>
          <div className="text-base-content/60 truncate text-xs">
            {[timer.callerId, timer.projectName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className={`font-mono tabular-nums ${failed ? 'text-error' : ''}`}>{elapsed}</span>
        {(failed || !timer.endedAt) && (
          <button
            type="button"
            className="btn btn-square btn-ghost text-error hover:bg-error/10 btn-xs"
            aria-label={`${failed ? 'Retry saving' : 'Stop'} ${title}`}
            disabled={busy}
            onClick={() => save.mutate(failed)}>
            {failed ? <IconRefresh className="size-4" /> : <IconPlayerStop className="size-4" />}
          </button>
        )}
      </div>
    </li>
  )
}
