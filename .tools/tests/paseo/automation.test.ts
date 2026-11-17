import type { PaseoRun, PaseoTriggerSchema } from '../../../src/services/paseo/triggers'

import { afterEach, expect, test, vi } from 'vitest'

import { db } from '../../../src/services/db'
import { dispatchPaseoRuns } from '../../../src/services/paseo/automation'
import { storage } from '../../../src/services/storage/config'
import { paseo } from '../../../src/services/tauri/paseo-client'

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await db.paseoRuns.clear()
})

test('automatic launches are spaced three seconds apart, including across queue drains', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const trigger: PaseoTriggerSchema = {
    formatVersion: 2,
    id: 'review',
    revision: 'revision',
    name: 'PR review',
    enabled: true,
    enabledAt: 0,
    afterMessageId: 0,
    scope: 'telegram-scope',
    source: 'telegram',
    marker: '',
    pattern: '.*',
    flags: '',
    captures: [],
    projectId: 'project',
    provider: 'codex',
    model: 'model',
    thinking: '',
    mode: '',
    prompt: 'Review the PR',
  }
  vi.spyOn(storage, 'get').mockImplementation(async key =>
    key === 'paseoTriggers' ? [trigger] : storage.config[key].default,
  )
  vi.spyOn(paseo, 'detect').mockResolvedValue({ available: true, detail: 'Ready' })
  const launchTimes: number[] = []
  const execute = vi.spyOn(paseo, 'execute').mockImplementation(async request => {
    launchTimes.push(Date.now())
    return { status: 'started', agentId: `agent-${request.runId}` }
  })
  const run = (messageId: number): PaseoRun => ({
    id: String(messageId),
    triggerId: trigger.id,
    revision: trigger.revision,
    triggerName: trigger.name,
    scope: trigger.scope,
    messageId,
    createdAt: messageId,
    status: 'pending',
    request: { ...trigger, title: trigger.name, triggerId: trigger.id, runId: String(messageId) },
  })
  await db.paseoRuns.bulkAdd([run(1), run(2), run(3)])
  const firstDrain = dispatchPaseoRuns(trigger.scope, () => true)
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
  await dispatchPaseoRuns(trigger.scope, () => true)
  for (const count of [2, 3]) {
    await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(count))
  }
  await firstDrain

  await db.paseoRuns.add(run(4))
  const secondDrain = dispatchPaseoRuns(trigger.scope, () => true)
  await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))
  expect(execute).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(3000)
  await secondDrain

  expect(execute.mock.calls.map(([request]) => request.runId)).toEqual(['1', '2', '3', '4'])
  for (let index = 1; index < launchTimes.length; index++) {
    expect(launchTimes[index] - launchTimes[index - 1]).toBeGreaterThanOrEqual(3000)
  }
  expect((await db.paseoRuns.toArray()).map(saved => saved.status)).toEqual(Array(4).fill('started'))
})
