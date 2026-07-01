import type { QuickTimerPreset } from '../services/storage/config'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  IconBolt,
  IconExternalLink,
  IconPencil,
  IconPlus,
  IconTimeDuration15,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { capitalCase } from 'change-case'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { type SubmitHandler, useForm } from 'react-hook-form'
import { z } from 'zod'

import { queryKeys } from '../lib/query-client'
import { clockify } from '../services/clockify/client'
import { type CreateTimeEntryRequest } from '../services/clockify/generated/clockify'
import { useStorage } from '../services/storage/useStorage'
import { cx } from '../utils/cx'
import { getErrorMessage } from '../utils/errors'
import { formatTemplate, parseTemplateTokens } from '../utils/templates'
import { appToast } from './AppToaster'

type QuickTimerFormProps = {
  quickTimerId: string | null
  onCancel: () => void
}

type QuickTimerStartFormProps = {
  quickTimerId: string
  onCancel: () => void
}

type QuickTimersWidgetProps = {
  activeQuickTimerId?: string
}

const QuickTimerFormSchema = z.object({
  descriptionTemplate: z.string().trim().min(1, 'Description template is required.'),
  icon: z
    .string()
    .trim()
    .refine(
      value => !value || Boolean(getSafeSvgIcon(value)),
      'Icon SVG must start with an <svg> element and cannot include scripts or event handlers.',
    ),
  name: z.string().trim().min(1, 'Name is required.'),
})

type QuickTimerFormSchema = z.infer<typeof QuickTimerFormSchema>

const quickTimerFormDefaultValues = {
  descriptionTemplate: '',
  icon: '',
  name: '',
} satisfies QuickTimerFormSchema

export function QuickTimersWidget({ activeQuickTimerId }: QuickTimersWidgetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const startDialogRef = useRef<HTMLDialogElement>(null)
  const [startingQuickTimerId, setStartingQuickTimerId] = useState<string | null>(null)
  const [editingQuickTimers, setEditingQuickTimers] = useState(false)
  const [editingQuickTimerId, setEditingQuickTimerId] = useState<string | null>(null)
  const [formResetKey, setFormResetKey] = useState(0)
  const [startFormResetKey, setStartFormResetKey] = useState(0)
  const [quickTimers] = useStorage('quickTimers')
  const [quickTimersColumns] = useStorage('quickTimersColumns')
  const normalizedColumns = normalizeQuickTimerColumns(quickTimersColumns)

  const openNewQuickTimerDialog = () => {
    setEditingQuickTimers(false)
    setEditingQuickTimerId(null)
    dialogRef.current?.showModal()
  }

  const closeNewQuickTimerDialog = () => {
    dialogRef.current?.close()
  }

  const closeStartQuickTimerDialog = () => {
    startDialogRef.current?.close()
  }

  const resetNewQuickTimerForm = () => {
    setEditingQuickTimerId(null)
    setFormResetKey(key => key + 1)
  }

  const resetStartQuickTimerForm = () => {
    setStartingQuickTimerId(null)
    setStartFormResetKey(key => key + 1)
  }

  const toggleQuickTimersEditing = () => {
    setEditingQuickTimers(editing => !editing)
  }

  const editQuickTimer = (quickTimerId: string) => {
    flushSync(() => {
      setEditingQuickTimers(false)
      setEditingQuickTimerId(quickTimerId)
      setFormResetKey(key => key + 1)
    })
    dialogRef.current?.showModal()
  }

  const startQuickTimer = (quickTimerId: string) => {
    flushSync(() => {
      setStartingQuickTimerId(quickTimerId)
      setStartFormResetKey(key => key + 1)
    })
    startDialogRef.current?.showModal()
  }

  return (
    <>
      <section className="border-base-content/5 bg-base-100 rounded-box overflow-hidden border">
        <header className="border-base-content/5 flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconTimeDuration15 className="text-primary size-6" />
            <div className="min-w-0">
              <h2 className="text-base leading-6 font-semibold">Quick Timers</h2>
              <p className="text-base-content/60 truncate text-sm">Reusable time presets</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {quickTimers.length > 0 ? (
              <button
                className="btn btn-square btn-ghost btn-sm"
                type="button"
                aria-label="Edit Quick Timers"
                aria-pressed={editingQuickTimers}
                onClick={toggleQuickTimersEditing}>
                <IconPencil className="size-4" />
              </button>
            ) : null}
            <button
              className="btn btn-square btn-ghost btn-sm"
              type="button"
              aria-label="Add Quick Timer"
              onClick={openNewQuickTimerDialog}>
              <IconPlus className="size-4" />
            </button>
          </div>
        </header>

        {quickTimers.length > 0 ? (
          <div
            className="grid gap-4 p-4"
            style={{ gridTemplateColumns: `repeat(${normalizedColumns}, minmax(0, 1fr))` }}>
            {quickTimers.map(quickTimer => (
              <button
                key={quickTimer.id}
                className={cx(
                  'group flex min-w-0 cursor-pointer flex-col items-center gap-1 text-center',
                  editingQuickTimers && 'animate-pulse',
                )}
                type="button"
                aria-label={
                  editingQuickTimers ? `Edit ${quickTimer.name} Quick Timer` : `Start ${quickTimer.name} Quick Timer`
                }
                onClick={() => {
                  if (editingQuickTimers) {
                    editQuickTimer(quickTimer.id)
                    return
                  }

                  startQuickTimer(quickTimer.id)
                }}>
                <span
                  className={cx(
                    'border-base-content/10 group-focus-visible:outline-primary grid h-[60px] w-full place-items-center rounded-md border transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2',
                    editingQuickTimers
                      ? 'bg-warning text-warning-content group-hover:bg-warning/80'
                      : activeQuickTimerId === quickTimer.id
                        ? 'tracking-active-surface group-hover:bg-accent/40'
                        : 'bg-base-200 group-hover:bg-primary group-hover:text-primary-content',
                  )}>
                  <QuickTimerIcon icon={quickTimer.icon} />
                </span>
                <span className="w-full truncate text-xs leading-4 font-medium">{quickTimer.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <dialog ref={dialogRef} className="modal" onClose={resetNewQuickTimerForm}>
        <div className="modal-box max-w-md rounded-lg">
          <QuickTimerForm key={formResetKey} quickTimerId={editingQuickTimerId} onCancel={closeNewQuickTimerDialog} />
        </div>

        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>

      <dialog ref={startDialogRef} className="modal" onClose={resetStartQuickTimerForm}>
        <div className="modal-box max-w-md rounded-lg">
          {startingQuickTimerId ? (
            <QuickTimerStartForm
              key={startFormResetKey}
              quickTimerId={startingQuickTimerId}
              onCancel={closeStartQuickTimerDialog}
            />
          ) : null}
        </div>

        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  )
}

function QuickTimerForm({ onCancel, quickTimerId }: QuickTimerFormProps) {
  const [quickTimers, setQuickTimers] = useStorage('quickTimers')
  const quickTimer = quickTimerId ? quickTimers.find(timer => timer.id === quickTimerId) : null
  const defaultValues = useMemo(
    () =>
      quickTimer
        ? {
            descriptionTemplate: quickTimer.descriptionTemplate,
            icon: quickTimer.icon,
            name: quickTimer.name,
          }
        : quickTimerFormDefaultValues,
    [quickTimer],
  )
  const title = quickTimerId ? 'Edit Quick Timer' : 'New Quick Timer'
  const submitLabel = quickTimerId ? 'Save' : 'Create'
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<QuickTimerFormSchema>({
    defaultValues,
    mode: 'onChange',
    resolver: zodResolver(QuickTimerFormSchema),
    shouldFocusError: false,
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  const submitQuickTimer: SubmitHandler<QuickTimerFormSchema> = async values => {
    await setQuickTimers(current => {
      if (!quickTimerId) {
        return [
          ...current,
          {
            descriptionTemplate: values.descriptionTemplate,
            icon: values.icon,
            id: crypto.randomUUID(),
            name: values.name,
          } satisfies QuickTimerPreset,
        ]
      }

      return current.map(timer =>
        timer.id === quickTimerId
          ? {
              ...timer,
              descriptionTemplate: values.descriptionTemplate,
              icon: values.icon,
              name: values.name,
            }
          : timer,
      )
    })
    onCancel()
  }

  const deleteQuickTimer = async () => {
    if (!quickTimerId) {
      return
    }

    await setQuickTimers(current => current.filter(timer => timer.id !== quickTimerId))
    onCancel()
  }

  return (
    <form aria-label={title} className="grid gap-5" onSubmit={event => void handleSubmit(submitQuickTimer)(event)}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg leading-7 font-semibold">{title}</h3>
          <p className="text-base-content/60 text-sm">Create a reusable timer preset.</p>
        </div>
        <button
          className="btn btn-square btn-ghost btn-sm"
          type="button"
          aria-label="Close Quick Timer dialog"
          onClick={onCancel}>
          <IconX className="size-4" />
        </button>
      </div>

      <div className="grid gap-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Name</legend>
          <input
            aria-label="Quick Timer name"
            className={cx('input input-primary w-full', errors.name && 'input-error')}
            placeholder="Meeting"
            type="text"
            {...register('name')}
          />
          {errors.name ? (
            <p className="fieldset-label text-error">{errors.name.message}</p>
          ) : (
            <p className="fieldset-label">Shown under the Quick Timer button.</p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Description Template</legend>
          <textarea
            aria-label="Quick Timer description template"
            className={cx(
              'textarea textarea-primary min-h-20 w-full resize-y font-mono text-sm',
              errors.descriptionTemplate && 'textarea-error',
            )}
            placeholder="Meeting with {name}"
            {...register('descriptionTemplate')}
          />
          {errors.descriptionTemplate ? (
            <p className="fieldset-label text-error">{errors.descriptionTemplate.message}</p>
          ) : (
            <p className="fieldset-label">
              Clockify entry description.
              <br />
              Use variables like {'{name}'} to ask for values before starting.
            </p>
          )}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Icon SVG</legend>
          <input
            aria-label="Quick Timer icon SVG"
            className={cx('input input-primary w-full font-mono text-xs', errors.icon && 'input-error')}
            placeholder="<svg ...>...</svg>"
            type="text"
            {...register('icon')}
          />
          {errors.icon ? (
            <p className="fieldset-label text-error">{errors.icon.message}</p>
          ) : (
            <p className="fieldset-label">
              SVG shown inside the Quick Timer button.{' '}
              <a
                className="link link-primary inline-flex w-fit items-center gap-1"
                href="https://tabler.io/icons"
                target="_blank"
                rel="noreferrer">
                Find icons here
                <IconExternalLink className="size-3" />
              </a>
            </p>
          )}
        </fieldset>
      </div>

      <div className="modal-action mt-0 flex items-center justify-between">
        <div>
          {quickTimerId ? (
            <button
              className="btn btn-square btn-ghost text-error hover:bg-error/10"
              type="button"
              aria-label="Delete Quick Timer"
              onClick={() => void deleteQuickTimer()}>
              <IconTrash className="size-5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

function QuickTimerStartForm({ onCancel, quickTimerId }: QuickTimerStartFormProps) {
  const queryClient = useQueryClient()
  const [clockifyBillable] = useStorage('clockifyBillable')
  const [clockifyDefaultProject] = useStorage('clockifyDefaultProject')
  const [, setClockifyQuickTimerEntryLinks] = useStorage('clockifyQuickTimerEntryLinks')
  const [quickTimers] = useStorage('quickTimers')
  const [quickTimersCache, setQuickTimersCache] = useStorage('quickTimersCache')
  const quickTimer = quickTimers.find(timer => timer.id === quickTimerId)
  const cachedValues = quickTimersCache.find(entry => entry.id === quickTimerId)
  const templateTokens = useMemo(
    () => parseTemplateTokens(quickTimer?.descriptionTemplate ?? ''),
    [quickTimer?.descriptionTemplate],
  )
  const defaultValues = useMemo(
    () =>
      Object.fromEntries(templateTokens.map(token => [token, getQuickTimerCachedValue(cachedValues, token)])) as Record<
        string,
        string
      >,
    [cachedValues, templateTokens],
  )
  const { handleSubmit, register, reset } = useForm<Record<string, string>>({
    defaultValues,
    mode: 'onChange',
  })

  useEffect(() => {
    reset(defaultValues)
  }, [defaultValues, reset])

  const startQuickTimerMutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const body = {
        billable: clockifyBillable,
        description: formatTemplate(quickTimer?.descriptionTemplate ?? '', values, {
          fallback: '',
          knownTokens: templateTokens,
        }),
        projectId: clockifyDefaultProject?.projectId,
        start: new Date().toISOString(),
        type: 'REGULAR',
      } satisfies CreateTimeEntryRequest

      return clockify.createTimeEntry(body, { params: { workspaceId: clockifyDefaultProject?.workspaceId ?? '' } })
    },
    onMutate: async values => {
      await setQuickTimersCache(current => [
        ...current.filter(entry => entry.id !== quickTimerId),
        {
          id: quickTimerId,
          values: Object.fromEntries(templateTokens.map(token => [token, values[token] ?? ''])),
        },
      ])
    },
    onError: error => {
      appToast.error('Could not start Clockify timer', {
        description: getErrorMessage(error),
      })
    },
    onSuccess: async (entry, values) => {
      if (entry.id) {
        await setClockifyQuickTimerEntryLinks(current => ({
          ...current,
          [entry.id as string]: {
            quickTimerId,
            values,
          },
        }))
      }

      appToast.success(`Started timer for ${quickTimer?.name ?? 'Quick Timer'}`)
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.runningEntry() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.summaryReport() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.clockify.entrySync() })
      onCancel()
    },
  })

  const submitQuickTimerValues: SubmitHandler<Record<string, string>> = values => {
    startQuickTimerMutation.mutate(values)
  }

  return (
    <form
      aria-label={`Start ${quickTimer?.name ?? 'Quick Timer'}`}
      className="grid gap-5"
      onSubmit={event => void handleSubmit(submitQuickTimerValues)(event)}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg leading-7 font-semibold">{quickTimer?.name ?? 'Quick Timer'}</h3>
          <p className="text-base-content/60 text-sm">Fill in the timer details.</p>
        </div>
        <button
          className="btn btn-square btn-ghost btn-sm"
          type="button"
          aria-label="Close Quick Timer dialog"
          onClick={onCancel}>
          <IconX className="size-4" />
        </button>
      </div>

      {templateTokens.length > 0 ? (
        <div className="grid gap-4">
          {templateTokens.map(token => (
            <fieldset key={token} className="fieldset">
              <legend className="fieldset-legend">{capitalCase(token)}</legend>
              <input
                aria-label={capitalCase(token)}
                className="input input-primary w-full"
                placeholder={capitalCase(token)}
                type="text"
                {...register(token)}
              />
            </fieldset>
          ))}
        </div>
      ) : null}

      <div className="modal-action mt-0">
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" type="submit" disabled={startQuickTimerMutation.isPending}>
          {startQuickTimerMutation.isPending ? <span className="loading loading-spinner size-4" /> : null}
          Start
        </button>
      </div>
    </form>
  )
}

function QuickTimerIcon({ icon }: { icon?: string }) {
  const svg = getSafeSvgIcon(icon)

  if (!svg) {
    return <IconBolt className="size-7" aria-hidden />
  }

  return (
    <span className="[&>svg]:size-7 [&>svg]:stroke-current" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
  )
}

function normalizeQuickTimerColumns(columns: number) {
  if (!Number.isFinite(columns)) {
    return 6
  }

  return Math.min(12, Math.max(1, Math.floor(columns)))
}

function getQuickTimerCachedValue(
  cachedValues: ({ values?: Record<string, string> } & Record<string, unknown>) | undefined,
  token: string,
) {
  const value = cachedValues?.values?.[token] ?? cachedValues?.[token]
  return typeof value === 'string' ? value : ''
}

function getSafeSvgIcon(icon: string | undefined) {
  const svg = icon?.trim()

  if (!svg?.startsWith('<svg')) {
    return null
  }

  if (/<script|<foreignObject|\son\w+=|javascript:/i.test(svg)) {
    return null
  }

  return svg
}
