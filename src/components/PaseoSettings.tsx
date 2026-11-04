import type { PaseoTriggerSchema } from '../services/paseo/triggers'
import type { PaseoLaunch } from '../services/tauri/paseo-client'
import type { ReactNode } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import { IconPencil, IconPlus, IconRefresh, IconTrash, IconX } from '@tabler/icons-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'

import { usePaseoStatus } from '../hooks/usePaseoAutomation'
import { queryKeys } from '../lib/query-client'
import { discoverPaseoCaptures, reconcilePaseoCaptures } from '../services/paseo/captures'
import { matchPaseoTrigger } from '../services/paseo/matcher'
import {
  paseoFlagOptions,
  PaseoSelectionError,
  PaseoTriggerFormSchema,
  readPaseoTriggers,
  renderPaseoPrompt,
  validatePaseoSelection,
} from '../services/paseo/triggers'
import { storage } from '../services/storage/config'
import { useStorage } from '../services/storage/useStorage'
import { paseo } from '../services/tauri/paseo-client'
import { useTelegram } from '../services/telegram/session-provider'
import { cx } from '../utils/cx'
import { getErrorMessage } from '../utils/errors'
import { appToast } from './AppToaster'
import { SettingsRow, SettingsSection } from './settings/SettingsSection'

export function PaseoSettings() {
  const status = usePaseoStatus()
  const telegram = useTelegram()
  const [stored, setTriggers] = useStorage('paseoTriggers')
  const triggers = readPaseoTriggers(stored)
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<PaseoTriggerSchema | null>(null)
  const [busy, setBusy] = useState(false)
  const scope = telegram.notifications.store?.scope
  const close = () => {
    if (!busy) dialog.current?.close()
  }
  const edit = (trigger?: PaseoTriggerSchema) => {
    setDraft(
      trigger ?? {
        formatVersion: 2,
        id: crypto.randomUUID(),
        revision: crypto.randomUUID(),
        name: '',
        enabled: true,
        enabledAt: 0,
        afterMessageId: 0,
        scope: scope ?? '',
        source: 'telegram',
        marker: '',
        pattern: '',
        flags: 'i',
        captures: [],
        projectId: '',
        provider: '',
        model: '',
        thinking: '',
        mode: '',
        prompt: '',
      },
    )
    dialog.current?.showModal()
  }
  const save = async (trigger: PaseoTriggerSchema, validate = true) => {
    if (validate) {
      PaseoTriggerFormSchema.parse(trigger)
      await validatePaseoSelection(trigger)
    }
    let afterMessageId = trigger.afterMessageId
    if (trigger.enabled) {
      if (trigger.scope !== scope || !telegram.chat?.isReady)
        throw new Error('Connect this trigger’s Telegram account and group before enabling it.')
      const checkpoint = await telegram.notifications.store?.checkpoint()
      if (!checkpoint) throw new Error('Wait for Telegram’s first notification sync before enabling this trigger.')
      afterMessageId = checkpoint.lastMessageId
    }
    const next = {
      ...trigger,
      formatVersion: 2,
      name: trigger.name.trim(),
      revision: crypto.randomUUID(),
      enabledAt: trigger.enabled ? Date.now() : 0,
      afterMessageId,
    }
    await setTriggers(current => {
      const items = readPaseoTriggers(current)
      return items.some(item => item.id === next.id)
        ? items.map(item => (item.id === next.id ? next : item))
        : [...items, next]
    })
    if (
      readPaseoTriggers(await storage.get('paseoTriggers')).find(item => item.id === next.id)?.revision !==
      next.revision
    )
      throw new Error('Could not save the trigger. Try again.')
  }
  const toggle = async (trigger: PaseoTriggerSchema) => {
    setBusy(true)
    try {
      await save({ ...trigger, enabled: !trigger.enabled }, !trigger.enabled)
    } catch (error) {
      appToast.error(error instanceof Error ? error.message : 'Could not update the trigger.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingsSection title="Paseo">
      <SettingsRow
        label="Connection"
        description={
          status.data?.detail ??
          (status.isError
            ? 'Could not detect Paseo. Check the installation and try again.'
            : 'Looking for Paseo on this computer.')
        }>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('badge', status.data?.available ? 'badge-success' : 'badge-ghost')}>
            {status.isPending ? 'Checking' : status.data?.available ? 'Available' : 'Unavailable'}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={status.isFetching}
            onClick={() => void status.refetch()}>
            <IconRefresh className="size-4" /> Check again
          </button>
          {!status.data?.available && (
            <button
              className="btn btn-link btn-sm"
              type="button"
              onClick={() =>
                void openUrl('https://paseo.sh/docs').catch(() => appToast.error('Could not open the setup guide.'))
              }>
              Set up Paseo
            </button>
          )}
        </div>
      </SettingsRow>
      <SettingsRow label="Triggers" description="Match an incoming message and start a Paseo agent with your prompt.">
        <button className="btn btn-primary btn-sm" type="button" disabled={!scope || busy} onClick={() => edit()}>
          <IconPlus className="size-4" /> Add trigger
        </button>
      </SettingsRow>
      {!scope && <div className="px-4 py-3 text-sm opacity-70">Connect Telegram to create a trigger.</div>}
      {triggers.map(trigger => (
        <SettingsRow
          key={trigger.id}
          label={trigger.name}
          description={
            trigger.formatVersion !== 2
              ? 'Choose a project and agent to finish setup'
              : trigger.marker
                ? `<@paseo:${trigger.marker}>`
                : trigger.pattern
          }>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              aria-label={`Enable ${trigger.name}`}
              checked={trigger.enabled}
              disabled={busy || (!trigger.enabled && trigger.scope !== scope)}
              onChange={() => void toggle(trigger)}
            />
            <button
              type="button"
              className="btn btn-square btn-ghost btn-sm"
              aria-label={`Edit ${trigger.name}`}
              title="Edit trigger"
              disabled={busy}
              onClick={() => edit(trigger)}>
              <IconPencil className="size-4" />
            </button>
          </div>
        </SettingsRow>
      ))}
      <dialog
        ref={dialog}
        className="modal"
        onClose={() => setDraft(null)}
        onCancel={event => {
          if (busy) event.preventDefault()
        }}>
        <div className="modal-box max-h-[calc(100dvh-3rem)] max-w-3xl rounded-lg">
          {!!draft && (
            <PaseoTriggerForm
              key={`${draft.id}:${draft.revision}`}
              trigger={draft}
              available={!!status.data?.available}
              onClose={close}
              onRunBusyChange={setBusy}
              onSave={async value => {
                setBusy(true)
                try {
                  await save(value)
                  dialog.current?.close()
                } finally {
                  setBusy(false)
                }
              }}
              onDelete={
                triggers.some(item => item.id === draft.id)
                  ? async () => {
                      setBusy(true)
                      try {
                        await setTriggers(current => readPaseoTriggers(current).filter(item => item.id !== draft.id))
                        if (readPaseoTriggers(await storage.get('paseoTriggers')).some(item => item.id === draft.id))
                          throw new Error('Could not delete the trigger. Try again.')
                        dialog.current?.close()
                      } finally {
                        setBusy(false)
                      }
                    }
                  : undefined
              }
            />
          )}
        </div>
        <form className="modal-backdrop" method="dialog">
          <button type="submit" disabled={busy}>
            close
          </button>
        </form>
      </dialog>
    </SettingsSection>
  )
}

function TriggerField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <fieldset className="fieldset min-w-0">
      <legend className="fieldset-legend">
        {label}
        {!!required && (
          <span className="text-error" aria-label="required">
            *
          </span>
        )}
      </legend>
      {children}
      {error ? (
        <p className="fieldset-label text-error" role="alert">
          {error}
        </p>
      ) : (
        !!hint && <p className="fieldset-label">{hint}</p>
      )}
    </fieldset>
  )
}

function PaseoTriggerForm({
  trigger,
  available,
  onSave,
  onClose,
  onDelete,
  onRunBusyChange,
}: {
  trigger: PaseoTriggerSchema
  available: boolean
  onSave: (value: PaseoTriggerSchema) => Promise<void>
  onClose: () => void
  onDelete?: () => Promise<void>
  onRunBusyChange: (busy: boolean) => void
}) {
  const form = useForm({
    defaultValues: trigger,
    resolver: zodResolver(PaseoTriggerFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { fields, replace } = useFieldArray({ control: form.control, name: 'captures' })
  const pattern = form.watch('pattern')
  const flags = form.watch('flags')
  const marker = form.watch('marker')
  const provider = form.watch('provider')
  const modelId = form.watch('model')
  const projectId = form.watch('projectId')
  const thinking = form.watch('thinking')
  const modeId = form.watch('mode')
  const projects = useQuery({
    queryKey: queryKeys.paseo.projects,
    queryFn: paseo.projects,
    enabled: available,
    staleTime: 30_000,
    retry: false,
  })
  const providers = useQuery({
    queryKey: queryKeys.paseo.providers,
    queryFn: paseo.providers,
    enabled: available,
    staleTime: 30_000,
    retry: false,
  })
  const selectedProvider = useMemo(() => providers.data?.find(item => item.id === provider), [providers.data, provider])
  const providerAvailable = !!selectedProvider
  const selectedMode = useMemo(
    () => selectedProvider?.modes?.find(mode => mode.id === modeId),
    [selectedProvider, modeId],
  )
  const models = useQuery({
    queryKey: queryKeys.paseo.models(provider),
    queryFn: () => paseo.models(provider),
    enabled: available && providerAvailable,
    staleTime: 30_000,
    retry: false,
  })
  const model = useMemo(() => models.data?.find(item => item.id === modelId), [models.data, modelId])
  const metadata = useMemo(() => {
    try {
      return { groups: discoverPaseoCaptures(pattern, flags), error: undefined }
    } catch (error) {
      return { groups: undefined, error: getErrorMessage(error) }
    }
  }, [pattern, flags])
  useEffect(() => {
    if (!metadata.groups) return
    const previous = form.getValues('captures')
    const next = reconcilePaseoCaptures(metadata.groups, previous)
    if (JSON.stringify(previous) !== JSON.stringify(next)) replace(next)
  }, [metadata, form.getValues, replace])

  const promptInput = useRef<HTMLTextAreaElement | null>(null)
  const [sample, setSample] = useState('')
  const [preview, setPreview] = useState<{ values: Record<string, string | undefined>; prompt: string } | null>(null)
  const [previewResult, setPreviewResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const launchInFlight = useRef(false)
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState<PaseoLaunch | null>(null)
  useEffect(() => {
    const dialog = confirmationDialog.current
    if (confirmation && !dialog?.open) dialog?.showModal()
    else if (!confirmation && dialog?.open) dialog.close()
  }, [confirmation])
  const previewController = useRef<AbortController | null>(null)
  useEffect(() => () => previewController.current?.abort(), [])
  const clearPreview = () => {
    previewController.current?.abort()
    setPreview(null)
    setPreviewResult(null)
    setConfirmation(null)
    setPreviewing(false)
  }
  const captureTokens = metadata.groups
    ? [
        ...new Set(
          form
            .watch('captures')
            .map(capture => capture.token)
            .filter(Boolean),
        ),
      ]
    : []
  const tokenGroups = [
    { label: 'Message', tokens: ['message', 'topic'] },
    { label: 'Sender', tokens: ['sender', 'sender-id'] },
    ...(captureTokens.length ? [{ label: 'Captures', tokens: captureTokens }] : []),
  ]
  const insertToken = (token: string) => {
    const input = promptInput.current
    const value = form.getValues('prompt')
    const start = input?.selectionStart ?? value.length
    const end = input?.selectionEnd ?? value.length
    const text = `{${token}}`
    form.setValue('prompt', value.slice(0, start) + text + value.slice(end), {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    })
    clearPreview()
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + text.length, start + text.length)
    })
  }
  const submit = async (value: PaseoTriggerFormSchema) => {
    form.clearErrors('root')
    try {
      await onSave(value)
    } catch (error) {
      if (error instanceof PaseoSelectionError)
        form.setError(error.field, { message: error.message }, { shouldFocus: true })
      else form.setError('root', { message: getErrorMessage(error) })
    }
  }
  const showPreview = async (realRun = false) => {
    clearPreview()
    const controller = new AbortController()
    previewController.current = controller
    setPreviewing(true)
    try {
      if (!(await form.trigger())) {
        if (!controller.signal.aborted) setPreviewResult({ status: 'error', message: 'Fix the highlighted fields.' })
        return
      }
      if (controller.signal.aborted) return
      const value = PaseoTriggerFormSchema.parse(form.getValues())
      const match = await matchPaseoTrigger(value, sample, controller.signal)
      if (controller.signal.aborted) return
      if (!match.matched) {
        setPreviewResult({ status: 'error', message: match.reason ?? 'No match.' })
        return
      }
      const prompt = renderPaseoPrompt(value, {
        ...match.values,
        message: sample,
        sender: 'Sample sender',
        'sender-id': '123456',
        topic: 'Sample topic',
      })
      setPreview({ values: match.values, prompt })
      setPreviewResult({ status: 'success', message: 'Matched.' })
      if (realRun) {
        await validatePaseoSelection(value)
        if (controller.signal.aborted) return
        setConfirmation({
          projectId: value.projectId,
          provider: value.provider,
          model: value.model,
          thinking: value.thinking,
          mode: value.mode,
          prompt,
          title: value.name.trim(),
          runId: `sample-${crypto.randomUUID()}`,
          triggerId: value.id,
          revision: value.revision,
          scope: value.scope,
        })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof PaseoSelectionError)
          form.setError(error.field, { message: error.message }, { shouldFocus: true })
        setPreviewResult({ status: 'error', message: getErrorMessage(error) })
      }
    } finally {
      if (!controller.signal.aborted) setPreviewing(false)
    }
  }
  const sampleRun = useMutation({
    mutationFn: paseo.executeSample,
    networkMode: 'always',
    retry: false,
    onMutate: () => onRunBusyChange(true),
    onSuccess: result => {
      if (result.status === 'started' || result.status === 'completed') {
        setPreviewResult({ status: 'success', message: 'Agent started in Paseo.' })
        appToast.success('Agent started in Paseo.')
      } else {
        setPreviewResult({ status: 'error', message: result.detail ?? 'The run did not start.' })
      }
    },
    onError: () => {
      console.warn('[paseo] Sample run result unconfirmed. Check Paseo before trying again.')
      setPreviewResult({ status: 'error', message: 'Run result unconfirmed. Check Paseo before trying again.' })
    },
    onSettled: () => {
      setConfirmation(null)
      onRunBusyChange(false)
      launchInFlight.current = false
    },
  })
  const runSample = () => {
    if (!confirmation || launchInFlight.current) return
    launchInFlight.current = true
    sampleRun.mutate(confirmation)
  }
  const promptField = form.register('prompt')
  const selectChanged = { shouldDirty: true, shouldValidate: form.formState.isSubmitted }
  const pending = form.formState.isSubmitting || deleting || previewing || sampleRun.isPending
  return (
    <>
      <form className="grid gap-5" noValidate onSubmit={form.handleSubmit(submit)} onChange={clearPreview}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{onDelete ? 'Edit trigger' : 'New trigger'}</h3>
            <p className="text-base-content/60 text-sm">Match a message and start a Paseo agent with your prompt.</p>
          </div>
          <button
            className="btn btn-square btn-ghost btn-sm"
            type="button"
            aria-label="Close trigger"
            disabled={pending}
            onClick={onClose}>
            <IconX className="size-4" />
          </button>
        </div>
        <TriggerField label="Name" required error={form.formState.errors.name?.message}>
          <input
            className={cx('input w-full', form.formState.errors.name ? 'input-error border-error' : 'input-primary')}
            aria-label="Trigger name"
            required
            aria-invalid={!!form.formState.errors.name}
            {...form.register('name')}
          />
        </TriggerField>
        <TriggerField label="Source">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input className="radio radio-primary" type="radio" value="telegram" {...form.register('source')} />{' '}
              Telegram
            </label>
            {['GitHub', 'Linear'].map(source => (
              <label key={source} className="text-base-content/50 flex items-center gap-2 text-sm">
                <input
                  className="radio disabled:opacity-50"
                  type="radio"
                  name="source"
                  value={source.toLowerCase()}
                  disabled
                />{' '}
                {source}
              </label>
            ))}
          </div>
        </TriggerField>
        <TriggerField
          label="Marker"
          error={form.formState.errors.marker?.message}
          hint={`A marker directs a Telegram message to this trigger. Enter ${marker.trim() || 'pr-review'} here, then include <@paseo:${marker.trim() || 'pr-review'}> in the message. Leave blank to match messages by pattern alone.`}>
          <input
            className={cx(
              'input w-full font-mono',
              form.formState.errors.marker ? 'input-error border-error' : 'input-primary',
            )}
            aria-label="Marker"
            aria-invalid={!!form.formState.errors.marker}
            {...form.register('marker')}
          />
        </TriggerField>
        <TriggerField
          label="Message pattern"
          required
          error={form.formState.errors.pattern?.message ?? (pattern ? metadata.error : undefined)}
          hint="The trigger runs when this pattern matches the message text or caption. Capture groups extract values you can name and use in your prompt; every capture must have a value.">
          <textarea
            className={cx(
              'textarea min-h-24 w-full font-mono text-sm',
              form.formState.errors.pattern || (pattern && metadata.error)
                ? 'textarea-error border-error'
                : 'textarea-primary',
            )}
            aria-label="Message pattern"
            placeholder={String.raw`review\s+(https://github\.com/[^/]+/[^/]+/pull/\d+)`}
            required
            aria-invalid={!!form.formState.errors.pattern || (!!pattern && !!metadata.error)}
            spellCheck={false}
            {...form.register('pattern')}
          />
        </TriggerField>
        <TriggerField label="Pattern options" error={form.formState.errors.flags?.message}>
          <div className="grid gap-3 sm:grid-cols-2">
            {paseoFlagOptions.map(flag => (
              <label className="flex cursor-pointer items-center gap-2 text-sm" key={flag.value}>
                <input
                  className="checkbox checkbox-primary"
                  type="checkbox"
                  checked={flags.includes(flag.value)}
                  onChange={event =>
                    form.setValue(
                      'flags',
                      paseoFlagOptions
                        .filter(option =>
                          option.value === flag.value ? event.target.checked : flags.includes(option.value),
                        )
                        .map(option => option.value)
                        .join(''),
                      selectChanged,
                    )
                  }
                />
                {flag.label}
                <code className="text-base-content/60 text-xs">{flag.value}</code>
              </label>
            ))}
          </div>
        </TriggerField>
        {!!metadata.groups?.length && (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div className="grid gap-3 sm:grid-cols-2" key={field.id}>
                <TriggerField label={`Capture ${field.group}`} hint="Detected from your pattern.">
                  <input
                    className="input input-primary w-full font-mono"
                    aria-label={`Capture ${field.group}`}
                    value={field.expression}
                    readOnly
                  />
                </TriggerField>
                <TriggerField
                  label="Token name"
                  required
                  error={form.formState.errors.captures?.[index]?.token?.message}
                  hint="Use lowercase words separated by hyphens, starting with a letter. Each token name must be unique.">
                  <input
                    className={cx(
                      'input w-full font-mono',
                      form.formState.errors.captures?.[index]?.token ? 'input-error border-error' : 'input-primary',
                    )}
                    aria-label={`Token name for capture ${field.group}`}
                    required
                    aria-invalid={!!form.formState.errors.captures?.[index]?.token}
                    {...form.register(`captures.${index}.token`, {
                      onChange: () => {
                        if (form.formState.isSubmitted) void form.trigger('captures')
                      },
                    })}
                  />
                </TriggerField>
              </div>
            ))}
          </div>
        )}
        {!available && <p className="text-sm opacity-70">Open Paseo to load projects and agents.</p>}
        <TriggerField
          label="Project"
          required
          error={
            form.formState.errors.projectId?.message ?? (projects.error ? getErrorMessage(projects.error) : undefined)
          }
          hint={
            projects.data && !projects.data.length
              ? 'No Git projects registered in Paseo.'
              : 'Each message starts a fresh worktree from main. Use your prompt to check out the PR or branch you want.'
          }>
          <div className="flex min-w-0 items-center gap-2">
            <select
              className={cx(
                'select min-w-0 flex-1',
                form.formState.errors.projectId || projects.error ? 'select-error border-error' : 'select-primary',
              )}
              aria-label="Paseo project"
              required
              aria-invalid={!!form.formState.errors.projectId || !!projects.error}
              disabled={!available || projects.isFetching}
              {...form.register('projectId')}
              value={projectId}>
              <option value="">{projects.isFetching ? 'Loading projects…' : 'Select a project'}</option>
              {!!projectId && !projects.data?.some(project => project.projectId === projectId) && (
                <option value={projectId}>Saved project · unavailable</option>
              )}
              {projects.data?.map(project => (
                <option value={project.projectId} key={project.projectId}>
                  {project.name} · {project.path}
                </option>
              ))}
            </select>
            <button
              className="btn btn-square btn-ghost shrink-0"
              type="button"
              aria-label="Refresh projects"
              title="Refresh projects"
              disabled={!available || projects.isFetching}
              onClick={() => void projects.refetch()}>
              <IconRefresh className={cx('size-4', projects.isFetching && 'animate-spin')} />
            </button>
          </div>
        </TriggerField>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TriggerField
            label="Provider"
            required
            error={
              form.formState.errors.provider?.message ??
              (providers.error ? getErrorMessage(providers.error) : undefined)
            }
            hint={providers.data && !providers.data.length ? 'Enable a provider in Paseo to continue.' : undefined}>
            <div className="flex min-w-0 items-center gap-2">
              <select
                className={cx(
                  'select min-w-0 flex-1',
                  form.formState.errors.provider || providers.error ? 'select-error border-error' : 'select-primary',
                )}
                aria-label="Paseo provider"
                required
                aria-invalid={!!form.formState.errors.provider || !!providers.error}
                disabled={!available || providers.isFetching}
                {...form.register('provider')}
                value={provider}
                onChange={event => {
                  form.setValue('provider', event.target.value, selectChanged)
                  form.setValue('model', '', selectChanged)
                  form.setValue('thinking', '', selectChanged)
                  form.setValue(
                    'mode',
                    providers.data?.find(item => item.id === event.target.value)?.defaultModeId ?? '',
                    selectChanged,
                  )
                }}>
                <option value="">Select a provider</option>
                {!!provider && !providerAvailable && <option value={provider}>{provider} · unavailable</option>}
                {providers.data?.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-square btn-ghost shrink-0"
                type="button"
                aria-label="Refresh providers"
                title="Refresh providers"
                disabled={!available || providers.isFetching}
                onClick={() => {
                  void providers.refetch()
                }}>
                <IconRefresh className={cx('size-4', providers.isFetching && 'animate-spin')} />
              </button>
            </div>
          </TriggerField>
          <TriggerField
            label="Model"
            required
            error={form.formState.errors.model?.message ?? (models.error ? getErrorMessage(models.error) : undefined)}>
            <select
              className={cx(
                'select w-full',
                form.formState.errors.model || models.error ? 'select-error border-error' : 'select-primary',
              )}
              aria-label="Paseo model"
              required
              aria-invalid={!!form.formState.errors.model || !!models.error}
              disabled={!available || !providerAvailable || models.isFetching}
              {...form.register('model')}
              value={modelId}
              onChange={event => {
                const selected = models.data?.find(item => item.id === event.target.value)
                form.setValue('model', event.target.value, selectChanged)
                form.setValue(
                  'thinking',
                  selected?.thinkingOptionIds.includes(selected.defaultThinkingOptionId ?? '')
                    ? selected!.defaultThinkingOptionId!
                    : (selected?.thinkingOptionIds[0] ?? ''),
                  selectChanged,
                )
              }}>
              <option value="">{models.isFetching ? 'Loading models…' : 'Select a model'}</option>
              {!!modelId && !model && <option value={modelId}>{modelId} · unavailable</option>}
              {models.data?.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </TriggerField>
          <TriggerField
            label="Thinking effort"
            required={!!model?.thinkingOptionIds.length}
            error={form.formState.errors.thinking?.message}>
            <select
              className={cx(
                'select w-full',
                form.formState.errors.thinking ? 'select-error border-error' : 'select-primary',
              )}
              aria-label="Thinking effort"
              required={!!model?.thinkingOptionIds.length}
              aria-invalid={!!form.formState.errors.thinking}
              disabled={!available || !providerAvailable || models.isFetching || !model?.thinkingOptionIds.length}
              {...form.register('thinking')}
              value={thinking}>
              <option value="">{model && !model.thinkingOptionIds.length ? 'Not supported' : 'Select effort'}</option>
              {!!thinking && !model?.thinkingOptionIds.includes(thinking) && (
                <option value={thinking}>{thinking} · unavailable</option>
              )}
              {model?.thinkingOptionIds.map(option => (
                <option value={option} key={option}>
                  {option}
                </option>
              ))}
            </select>
          </TriggerField>
          <TriggerField label="Permissions" error={form.formState.errors.mode?.message}>
            <select
              className={cx(
                'select w-full',
                form.formState.errors.mode ? 'select-error border-error' : 'select-primary',
              )}
              aria-label="Paseo permissions"
              aria-invalid={!!form.formState.errors.mode}
              disabled={!available || !providerAvailable || providers.isFetching || !selectedProvider?.modes?.length}
              {...form.register('mode')}
              value={modeId}>
              <option value="">{providerAvailable ? 'Paseo default' : 'Select permissions'}</option>
              {!!modeId && !selectedMode && <option value={modeId}>{modeId} · unavailable</option>}
              {selectedProvider?.modes?.map(mode => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </TriggerField>
        </div>
        <TriggerField
          label="Prompt"
          required
          error={form.formState.errors.prompt?.message}
          hint="Your instructions for the agent. Capture tokens are replaced with values from the message.">
          <textarea
            className={cx(
              'textarea min-h-40 w-full font-mono text-sm',
              form.formState.errors.prompt ? 'textarea-error border-error' : 'textarea-primary',
            )}
            aria-label="Paseo prompt"
            placeholder="Check out {pr-url}, review the changes, and post your findings."
            required
            aria-invalid={!!form.formState.errors.prompt}
            spellCheck={false}
            {...promptField}
            ref={element => {
              promptField.ref(element)
              promptInput.current = element
            }}
          />
        </TriggerField>
        <div className="flex flex-col gap-3">
          {tokenGroups.map(group => (
            <div key={group.label} className="flex min-w-0 flex-col gap-2">
              <div className="text-base-content/60 text-xs leading-5 font-medium">{group.label}</div>
              <div className="flex flex-wrap gap-2">
                {group.tokens.map(token => (
                  <button
                    key={token}
                    className="btn btn-outline btn-xs font-mono"
                    type="button"
                    onClick={() => insertToken(token)}>{`{${token}}`}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <details className="collapse-arrow border-base-300 collapse border">
          <summary className="collapse-title text-sm font-medium">Preview with a sample message</summary>
          <div className="collapse-content space-y-3">
            <fieldset className="fieldset">
              <textarea
                className={cx(
                  'textarea min-h-24 w-full',
                  previewResult?.status === 'error'
                    ? 'textarea-error border-error'
                    : previewResult?.status === 'success'
                      ? 'textarea-success border-success'
                      : 'textarea-primary',
                )}
                aria-invalid={previewResult?.status === 'error'}
                aria-describedby="paseo-preview-hint"
                aria-label="Sample Telegram message"
                value={sample}
                onChange={event => setSample(event.target.value)}
              />
              <p
                id="paseo-preview-hint"
                className={cx(
                  'fieldset-label',
                  previewResult?.status === 'error'
                    ? 'text-error'
                    : previewResult?.status === 'success' && 'text-success',
                )}
                role={previewResult?.status === 'error' ? 'alert' : 'status'}>
                {previewResult?.message ?? 'Paste a message, including the marker if configured.'}
              </p>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={!sample.trim() || pending}
                onClick={() => void showPreview()}>
                Test match
              </button>
              <button
                className="btn btn-outline btn-primary btn-sm"
                type="button"
                disabled={!available || !sample.trim() || pending}
                onClick={() => void showPreview(true)}>
                Run in Paseo
              </button>
              {previewing && <span className="loading loading-spinner loading-sm" aria-label="Checking sample" />}
            </div>
            {!!preview && (
              <div className="space-y-3 text-xs">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2 font-mono text-xs leading-5">
                  {Object.entries(preview.values).map(([token, value]) => (
                    <div className="contents" key={token}>
                      <dt className="font-mono">{`{${token}}`}</dt>
                      <dd className="break-all whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))}
                </dl>
                <pre className="bg-base-200 rounded-lg p-3 break-words whitespace-pre-wrap">{preview.prompt}</pre>
              </div>
            )}
          </div>
        </details>
        <label className="flex items-center gap-3 text-sm">
          <input className="toggle toggle-primary" type="checkbox" {...form.register('enabled')} /> Enabled for new
          messages
        </label>
        <p className="text-xs opacity-60">
          Saving starts from now. Old notifications and edits do not run the trigger. Clearing or snoozing notifications
          does not pause it.
        </p>
        {!!form.formState.errors.scope && (
          <p className="text-error text-sm" role="alert">
            {form.formState.errors.scope.message}
          </p>
        )}
        {!!form.formState.errors.root && (
          <p className="text-error text-sm" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            {!!onDelete && (
              <button
                className="btn btn-error btn-outline btn-sm"
                type="button"
                disabled={pending}
                onClick={() => {
                  setDeleting(true)
                  void onDelete()
                    .catch(error => form.setError('root', { message: getErrorMessage(error) }))
                    .finally(() => setDeleting(false))
                }}>
                <IconTrash className="size-4" /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" type="button" disabled={pending} onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {form.formState.isSubmitting && <span className="loading loading-spinner loading-xs" />} Save trigger
            </button>
          </div>
        </div>
      </form>
      <dialog
        ref={confirmationDialog}
        className="modal"
        aria-labelledby="paseo-run-title"
        onClose={event => {
          event.stopPropagation()
          setConfirmation(null)
        }}
        onCancel={event => {
          event.stopPropagation()
          if (launchInFlight.current) event.preventDefault()
        }}>
        <div className="modal-box grid max-w-lg gap-5 rounded-lg">
          <div className="grid gap-1">
            <h3 id="paseo-run-title" className="text-lg leading-7 font-semibold">
              Run in Paseo?
            </h3>
            <p className="text-base-content/60 text-sm">Start a real agent using this sample message?</p>
          </div>
          <div className="modal-action mt-0">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={sampleRun.isPending}
              onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!confirmation || sampleRun.isPending}
              onClick={runSample}>
              {sampleRun.isPending && <span className="loading loading-spinner loading-xs" />}
              {sampleRun.isPending ? 'Starting…' : 'Run now'}
            </button>
          </div>
        </div>
        <button
          className="modal-backdrop"
          type="button"
          aria-label="Cancel run"
          disabled={sampleRun.isPending}
          onClick={() => setConfirmation(null)}
        />
      </dialog>
    </>
  )
}
