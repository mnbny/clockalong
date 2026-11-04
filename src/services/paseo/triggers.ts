import type { PaseoLaunch } from '../tauri/paseo-client'

import { kebabCase } from 'change-case'
import { z } from 'zod'

import { getUnknownTemplateTokens } from '../../utils/templates'
import { paseo } from '../tauri/paseo-client'
import { discoverPaseoCaptures, reconcilePaseoCaptures } from './captures'

export const paseoContextTokens = ['message', 'sender', 'sender-id', 'topic'] as const
export const paseoFlagOptions = [
  { value: 'i', label: 'Ignore case' },
  { value: 'm', label: 'Multiline anchors' },
  { value: 's', label: 'Dot matches newlines' },
  { value: 'u', label: 'Unicode' },
] as const

// Storage accepts incomplete legacy selections so the user can finish them in the editor.
export const PaseoTriggerSchema = z.object({
  formatVersion: z.number(),
  id: z.string().min(1),
  revision: z.string().min(1),
  name: z.string().max(100),
  enabled: z.boolean(),
  enabledAt: z.number().finite().nonnegative(),
  afterMessageId: z.number().int().nonnegative(),
  scope: z.string(),
  source: z.literal('telegram'),
  marker: z
    .string()
    .trim()
    .max(100)
    .refine(value => !/[<>\r\n]/.test(value), 'Enter only the marker text, without angle brackets.'),
  pattern: z.string().max(4000),
  flags: z.string().regex(/^(?!.*(.).*\1)[imsu]*$/, 'Use each supported flag at most once.'),
  captures: z.array(z.object({ group: z.string(), expression: z.string(), token: z.string() })).max(30),
  projectId: z.string(),
  provider: z.string(),
  model: z.string(),
  thinking: z.string(),
  mode: z.string(),
  prompt: z.string().max(32000),
})
export type PaseoTriggerSchema = z.infer<typeof PaseoTriggerSchema>

export class PaseoSelectionError extends Error {
  constructor(
    public field: 'projectId' | 'provider' | 'model' | 'thinking' | 'mode',
    message: string,
  ) {
    super(message)
    this.name = 'PaseoSelectionError'
  }
}

export async function validatePaseoSelection(trigger: PaseoTriggerSchema) {
  const [projects, providers] = await Promise.all([paseo.projects(), paseo.providers()])
  if (!projects.some(project => project.projectId === trigger.projectId)) {
    throw new PaseoSelectionError('projectId', 'Select a project registered in Paseo.')
  }
  const provider = providers.find(provider => provider.id === trigger.provider)
  if (!provider) {
    throw new PaseoSelectionError('provider', 'Select an enabled, available provider.')
  }
  if (trigger.mode && !provider.modes.some(mode => mode.id === trigger.mode)) {
    throw new PaseoSelectionError('mode', 'Select available permissions for this provider.')
  }
  const models = await paseo.models(trigger.provider)
  const model = models.find(model => model.id === trigger.model)
  if (!model) throw new PaseoSelectionError('model', 'Select an available model.')
  if (model.thinkingOptionIds.length ? !model.thinkingOptionIds.includes(trigger.thinking) : !!trigger.thinking) {
    throw new PaseoSelectionError('thinking', 'Select a supported thinking effort for this model.')
  }
}

const requiredTriggerText = (label: string) =>
  z.string({ required_error: `${label} is required.` }).refine(value => !!value.trim(), `${label} is required.`)

const isTriggerSlug = (value: string) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && kebabCase(value) === value
const slugHint = 'Use lowercase words separated by hyphens, starting with a letter.'
const CaptureMappingsSchema = z
  .array(
    PaseoTriggerSchema.shape.captures.element.extend({
      token: z.string().refine(isTriggerSlug, slugHint),
    }),
  )
  .max(30)
  .superRefine((captures, context) => {
    const reserved = new Set<string>([...paseoContextTokens, 'prompt', 'message-id', 'run-id'])
    captures.forEach((capture, index) => {
      const message = reserved.has(capture.token)
        ? 'This token name is reserved.'
        : capture.token && captures.some((other, otherIndex) => otherIndex !== index && other.token === capture.token)
          ? 'Token names must be unique.'
          : undefined
      if (message) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'token'], message })
    })
  })

export const PaseoTriggerFormSchema = PaseoTriggerSchema.extend({
  marker: z
    .string()
    .max(100)
    .refine(value => value === '' || isTriggerSlug(value), slugHint),
  name: requiredTriggerText('Name').and(PaseoTriggerSchema.shape.name),
  scope: requiredTriggerText('Telegram connection'),
  projectId: requiredTriggerText('Project'),
  provider: requiredTriggerText('Provider'),
  model: requiredTriggerText('Model'),
  pattern: requiredTriggerText('Message pattern').and(PaseoTriggerSchema.shape.pattern),
  prompt: requiredTriggerText('Prompt').and(PaseoTriggerSchema.shape.prompt),
  captures: CaptureMappingsSchema,
}).superRefine((trigger, context) => {
  const issue = (path: (string | number)[], message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path, message })
  try {
    const groups = discoverPaseoCaptures(trigger.pattern, trigger.flags)
    if (
      groups.length !== trigger.captures.length ||
      groups.some(
        (group, index) =>
          group.group !== trigger.captures[index]?.group || group.expression !== trigger.captures[index]?.expression,
      )
    ) {
      issue(['pattern'], 'Capture rows are updating. Check the mappings and save again.')
    }
  } catch (error) {
    issue(['pattern'], error instanceof Error ? error.message : 'Invalid pattern.')
  }
  const unknown = getUnknownTemplateTokens(trigger.prompt, [
    ...paseoContextTokens,
    ...trigger.captures.map(capture => capture.token),
  ])
  if (unknown.length) issue(['prompt'], `Unknown tokens: ${unknown.join(', ')}.`)
})

export type PaseoTriggerFormSchema = z.infer<typeof PaseoTriggerFormSchema>

export type PaseoRun = {
  id: string
  triggerId: string
  revision: string
  triggerName: string
  scope: string
  messageId: number
  createdAt: number
  status: 'pending' | 'dispatching' | 'started' | 'completed' | 'failed' | 'unconfirmed' | 'cancelled'
  request?: PaseoLaunch
  agentId?: string
  detail?: string
}

export function parseStoredPaseoTrigger(value: unknown) {
  const item = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return PaseoTriggerSchema.safeParse({
    formatVersion: 1,
    source: 'telegram',
    marker: '',
    projectId: '',
    provider: '',
    model: '',
    thinking: '',
    mode: '',
    ...item,
    captures: Array.isArray(item.captures)
      ? item.captures.map(capture => ({ expression: '', ...capture }))
      : item.captures,
  })
}

export function readPaseoTriggers(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = parseStoredPaseoTrigger(item)
    if (!parsed.success) return []
    const trigger = parsed.data
    if (trigger.formatVersion !== 2) {
      trigger.enabled = false
      trigger.enabledAt = 0
      try {
        trigger.captures = reconcilePaseoCaptures(
          discoverPaseoCaptures(trigger.pattern, trigger.flags),
          trigger.captures,
        )
      } catch {
        // Invalid saved patterns must remain editable.
      }
    }
    return [trigger]
  })
}

export function renderPaseoPrompt(trigger: PaseoTriggerSchema, values: Record<string, string | undefined>) {
  PaseoTriggerFormSchema.parse(trigger)
  for (const capture of trigger.captures) {
    if (!values[capture.token]?.trim()) throw new Error(`No value was captured for {${capture.token}}.`)
  }
  const prompt = trigger.prompt.replace(/\{([A-Za-z][A-Za-z0-9-]*)\}/g, (_, token: string) => {
    const value = values[token]
    if (value === undefined || !value.trim()) throw new Error(`No value is available for {${token}}.`)
    return value
  })
  if (new TextEncoder().encode(prompt).length > 64 * 1024) throw new Error('The rendered prompt is too large.')
  return prompt
}
