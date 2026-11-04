import type { PaseoTriggerSchema } from './triggers'

export function matchPaseoTrigger(trigger: PaseoTriggerSchema, text: string, signal?: AbortSignal) {
  return new Promise<{ matched: boolean; values: Record<string, string | undefined>; reason?: string }>(
    (resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'))
        return
      }
      const worker = new Worker(new URL('./matcher.worker.ts', import.meta.url), { type: 'module' })
      const cleanup = () => {
        clearTimeout(timer)
        worker.terminate()
        signal?.removeEventListener('abort', abort)
      }
      const abort = () => {
        cleanup()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('Pattern took too long. Simplify it and try again.'))
      }, 1000)
      signal?.addEventListener('abort', abort, { once: true })
      worker.onerror = () => {
        cleanup()
        reject(new Error('Could not evaluate the pattern.'))
      }
      worker.onmessage = event => {
        cleanup()
        if (event.data.error) reject(new Error(event.data.error))
        else resolve(event.data)
      }
      worker.postMessage({ trigger, text })
    },
  )
}
