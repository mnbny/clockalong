import type { NotificationMessage } from '../telegram/notification-store'
import type { PaseoRun } from './triggers'

import { db } from '../db'
import { storage } from '../storage/config'
import { paseo } from '../tauri/paseo-client'
import { matchPaseoTrigger } from './matcher'
import { readPaseoTriggers, renderPaseoPrompt } from './triggers'

export async function preparePaseoRuns(items: NotificationMessage[], scope: string, signal: AbortSignal) {
  const triggers = readPaseoTriggers(await storage.get('paseoTriggers')).filter(
    trigger => trigger.enabled && trigger.scope === scope,
  )
  const runs: PaseoRun[] = []
  if (!triggers.length) return runs
  for (const { message, topicTitle } of items) {
    signal.throwIfAborted()
    if (await db.telegramNotifications.get([scope, message.id])) continue
    for (const trigger of triggers) {
      if (message.date * 1000 < trigger.enabledAt || message.id <= trigger.afterMessageId || message.editDate) continue
      if (trigger.marker && !message.text.includes(`<@paseo:${trigger.marker}>`)) continue
      const id = JSON.stringify([trigger.id, scope, message.id])
      const run: PaseoRun = {
        id,
        triggerId: trigger.id,
        revision: trigger.revision,
        triggerName: trigger.name,
        scope,
        messageId: message.id,
        createdAt: Date.now(),
        status: 'pending',
      }
      try {
        const matched = await matchPaseoTrigger(trigger, message.text, signal)
        if (!matched.matched) continue
        const prompt = renderPaseoPrompt(trigger, {
          ...matched.values,
          message: message.text,
          sender: message.sender?.name,
          'sender-id': message.sender?.id,
          topic: topicTitle,
        })
        run.request = {
          projectId: trigger.projectId,
          provider: trigger.provider,
          model: trigger.model,
          thinking: trigger.thinking,
          mode: trigger.mode,
          prompt,
          title: trigger.name,
          runId: id,
          triggerId: trigger.id,
          revision: trigger.revision,
          scope,
        }
      } catch (error) {
        signal.throwIfAborted()
        console.warn(`[paseo] Trigger ${trigger.id}: preparation failed. Check the pattern and prompt mappings.`)
        run.status = 'failed'
        run.detail = error instanceof Error ? error.message : 'Could not prepare this trigger.'
      }
      runs.push(run)
    }
  }
  return runs
}

let recovery: Promise<unknown> | undefined
let draining = false

export async function dispatchPaseoRuns(scope: string, active: () => boolean) {
  if (draining || !active()) return
  draining = true
  try {
    recovery ??= db.paseoRuns
      .where('status')
      .equals('dispatching')
      .modify(run => {
        run.status = 'unconfirmed'
        run.detail = 'Clockalong restarted before the command result was saved. Check Paseo before sending again.'
        delete run.request
      })
      .then(count => {
        if (count)
          console.warn(
            `[paseo] ${count} interrupted execution(s) marked unconfirmed. Check Paseo before sending again.`,
          )
      })
      .catch(error => {
        recovery = undefined
        throw error
      })
    await recovery
    const pending = await db.paseoRuns.where('status').equals('pending').sortBy('createdAt')
    if (!pending.length || !active()) return
    const status = await paseo.detect()
    for (const run of pending) {
      if (!active()) return
      const trigger = readPaseoTriggers(await storage.get('paseoTriggers')).find(item => item.id === run.triggerId)
      if (
        !trigger?.enabled ||
        trigger.revision !== run.revision ||
        trigger.scope !== run.scope ||
        run.scope !== scope ||
        !run.request
      ) {
        await db.paseoRuns.update(run.id, {
          status: 'cancelled',
          request: undefined,
          detail: 'Trigger disabled, edited, or no longer in the selected group.',
        })
        console.info(`[paseo] Trigger ${run.triggerId}: cancelled; trigger or Telegram scope changed.`)
        continue
      }
      if (!status.available) continue
      const claimed = await db.transaction('rw', db.paseoRuns, async () => {
        const saved = await db.paseoRuns.get(run.id)
        if (saved?.status !== 'pending' || !active()) return false
        await db.paseoRuns.update(run.id, { status: 'dispatching' })
        return true
      })
      if (!claimed) continue
      try {
        const current = readPaseoTriggers(await storage.get('paseoTriggers')).find(item => item.id === run.triggerId)
        if (!active() || !current?.enabled || current.revision !== run.revision) {
          await db.paseoRuns.update(run.id, { status: 'cancelled', request: undefined })
          console.info(`[paseo] Trigger ${run.triggerId}: cancelled before launch.`)
          continue
        }
        console.info(`[paseo] Trigger ${run.triggerId}: launching.`)
        const result = await paseo.execute(run.request!)
        const summary = `[paseo] Trigger ${run.triggerId}: ${result.status}.${result.agentId ? ` Agent: ${result.agentId}.` : ''}${result.detail ? ` ${result.detail}` : ''}`
        if (result.status === 'failed' || result.status === 'unconfirmed') console.warn(summary)
        else console.info(summary)
        await db.paseoRuns.update(run.id, { ...result, request: undefined })
      } catch {
        console.warn(`[paseo] Trigger ${run.triggerId}: result unconfirmed. Check Paseo before sending again.`)
        await db.paseoRuns.update(run.id, {
          status: 'unconfirmed',
          request: undefined,
          detail: 'The command result could not be confirmed. Check Paseo before sending again.',
        })
      }
    }
  } finally {
    draining = false
  }
}
