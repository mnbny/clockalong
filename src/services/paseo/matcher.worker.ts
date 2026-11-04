import type { PaseoTriggerSchema } from './triggers'

self.onmessage = (event: MessageEvent<{ trigger: PaseoTriggerSchema; text: string }>) => {
  try {
    const { trigger, text } = event.data
    if (trigger.marker && !text.includes(`<@paseo:${trigger.marker}>`)) {
      self.postMessage({ matched: false, values: {}, reason: 'Marker is missing.' })
      return
    }
    const regex = new RegExp(trigger.pattern, trigger.flags)
    // The empty alternative exposes group metadata even when the sample does not match.
    const shape = new RegExp(`(?:${trigger.pattern})|`, trigger.flags).exec('')!
    for (const capture of trigger.captures) {
      const numeric = /^\d+$/.test(capture.group)
      if (
        numeric
          ? Number(capture.group) >= shape.length
          : !Object.prototype.hasOwnProperty.call(shape.groups ?? {}, capture.group)
      ) {
        throw new Error(`Capture group ${capture.group} does not exist.`)
      }
    }
    const match = regex.exec(text)
    const values: Record<string, string | undefined> = {}
    if (match) {
      for (const capture of trigger.captures) {
        values[capture.token] = /^\d+$/.test(capture.group)
          ? match[Number(capture.group)]
          : match.groups?.[capture.group]
      }
    }
    const missing = trigger.captures.filter(capture => !values[capture.token]?.trim())
    self.postMessage({
      matched: !!match && !missing.length,
      values,
      reason: !match
        ? 'Pattern did not match.'
        : missing.length
          ? `Empty captures: ${missing.map(capture => capture.group).join(', ')}.`
          : undefined,
    })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Could not evaluate the pattern.' })
  }
}
