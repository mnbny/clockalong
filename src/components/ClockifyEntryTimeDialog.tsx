import type { TimeEntryWithRatesDtoV1 } from '../services/clockify/generated/clockify'
import type { ClockifyTimeEntryInterval } from '../services/clockify/time-entry-interval'
import type { ReactNode } from 'react'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'

import { queryKeys } from '../lib/query-client'
import { MissingClockifyProjectError } from '../services/clockify/time-entries'
import { getClockifyTimeEntryIntervalFromMinutes } from '../services/clockify/time-entry-interval'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'

type ClockifyEntryTimeFormProps = {
  children?: ReactNode
  description: string
  entry?: TimeEntryWithRatesDtoV1
  onCancel: () => void
  onMutate?: () => Promise<void>
  onSave: (interval: ClockifyTimeEntryInterval) => Promise<unknown>
}

export function ClockifyEntryTimeDialog(props: ClockifyEntryTimeFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="modal" onClose={props.onCancel}>
      <div className="modal-box max-w-2xl rounded-lg">
        <ClockifyEntryTimeForm {...props} onCancel={() => dialogRef.current?.close()} />
      </div>
      <form className="modal-backdrop" method="dialog">
        <button type="submit">close</button>
      </form>
    </dialog>
  )
}

export function ClockifyEntryTimeForm({
  children,
  description,
  entry,
  onCancel,
  onMutate,
  onSave,
}: ClockifyEntryTimeFormProps) {
  const queryClient = useQueryClient()
  const titleId = useId()
  const [times, setTimes] = useState(() => {
    const end = new Date(entry?.timeInterval?.end ?? Date.now())
    const start = new Date(entry?.timeInterval?.start ?? end)
    return {
      start: toLocalDateTimeInputValue(start),
      end: toLocalDateTimeInputValue(end),
      durationMinutes: entry ? String((end.getTime() - start.getTime()) / 60_000) : '',
    }
  })
  const saveMutation = useMutation({
    mutationFn: () => {
      const start = new Date(times.start)
      const end = new Date(times.end)
      const minutes = Number(times.durationMinutes)

      if (
        !times.durationMinutes.trim() ||
        !Number.isFinite(minutes) ||
        minutes < 0 ||
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end < start ||
        (!entry && end <= start)
      ) {
        throw new Error('Use a valid start and end time with a positive duration.')
      }

      return onSave({ start: start.toISOString(), end: end.toISOString() })
    },
    onMutate,
    onError: error => {
      if (error instanceof MissingClockifyProjectError) {
        appToast.warning('Choose a Clockify project first', {
          description: 'Select an override in the Clockify widget or a default project in Settings.',
        })
        return
      }

      appToast.error(entry ? 'Could not update Clockify entry' : 'Could not add Clockify entry', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: () => {
      appToast.success(entry ? 'Clockify entry updated' : 'Clockify entry added')
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      onCancel()
    },
  })

  const updateDate = (field: 'start' | 'end', value: string) => {
    setTimes(current => {
      const next = { ...current, [field]: value }
      const minutes = (new Date(next.end).getTime() - new Date(next.start).getTime()) / 60_000
      return { ...next, durationMinutes: Number.isFinite(minutes) ? String(minutes) : current.durationMinutes }
    })
  }
  const updateDuration = (durationMinutes: string) => {
    setTimes(current => {
      const minutes = Number(durationMinutes)
      const anchor = new Date(entry ? current.start : current.end)
      if (!durationMinutes.trim() || !Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(anchor.getTime())) {
        return { ...current, durationMinutes }
      }

      const end = entry ? new Date(anchor.getTime() + minutes * 60_000) : anchor
      if (!Number.isFinite(end.getTime()) || !Number.isFinite(new Date(end.getTime() - minutes * 60_000).getTime())) {
        return { ...current, durationMinutes, [entry ? 'end' : 'start']: '' }
      }
      const start = minutes > 0 ? new Date(getClockifyTimeEntryIntervalFromMinutes(minutes, end).start) : end

      return { start: toLocalDateTimeInputValue(start), end: toLocalDateTimeInputValue(end), durationMinutes }
    })
  }

  return (
    <form
      aria-labelledby={titleId}
      className="grid gap-5"
      onSubmit={event => {
        event.preventDefault()
        if (!saveMutation.isPending) saveMutation.mutate()
      }}>
      <div className="grid gap-1">
        <h3 id={titleId} className="text-lg leading-7 font-semibold">
          {entry ? 'Edit Entry' : 'Add Time'}
        </h3>
        <p className="text-base-content/60 truncate text-sm">{description}</p>
      </div>

      {children}

      <fieldset className="grid gap-4 sm:grid-cols-3" disabled={saveMutation.isPending}>
        <label className="fieldset">
          <span className="fieldset-legend">Start</span>
          <input
            className="input input-primary w-full"
            required
            step="any"
            type="datetime-local"
            value={times.start}
            onChange={event => updateDate('start', event.currentTarget.value)}
          />
        </label>
        <label className="fieldset">
          <span className="fieldset-legend">End</span>
          <input
            className="input input-primary w-full"
            required
            step="any"
            type="datetime-local"
            value={times.end}
            onChange={event => updateDate('end', event.currentTarget.value)}
          />
        </label>
        <div className="fieldset">
          <span className="fieldset-legend">Duration</span>
          <label className="input input-primary w-full">
            <input
              aria-label="Clockify entry duration in minutes"
              autoFocus
              className="min-w-0 grow"
              min={0}
              required
              step="any"
              type="number"
              value={times.durationMinutes}
              onChange={event => updateDuration(event.currentTarget.value)}
            />
            <span className="label">min</span>
          </label>
        </div>
      </fieldset>

      <div className="modal-action mt-0">
        <button className="btn btn-ghost" type="button" disabled={saveMutation.isPending} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending && <span className="loading loading-spinner loading-sm" />}
          Save
        </button>
      </div>
    </form>
  )
}

function toLocalDateTimeInputValue(date: Date) {
  const offsetMilliseconds = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMilliseconds).toISOString().slice(0, 23)
}
