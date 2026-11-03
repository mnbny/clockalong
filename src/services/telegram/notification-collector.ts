import type { TelegramChat } from './chat'
import type { HistoryCursor, MessageRecord, TelegramMessageEvent } from './chat-data'
import type { TelegramNotificationStore } from './notification-store'

import { eligibleNotification } from './notification-store'

type NotificationSource = Pick<
  TelegramChat,
  'accountId' | 'signal' | 'subscribeMessages' | 'fetchNotificationHistory' | 'fetchNotificationMessages' | 'fetchTopic'
>

export class TelegramNotificationCollector {
  private controller = new AbortController()
  private queue = Promise.resolve()
  private unsubscribe = () => {}
  private timer: ReturnType<typeof setInterval> | undefined
  private collecting: Promise<void> | undefined
  private replayed = false
  private requestedRevalidation = 0
  private completedRevalidation = 0
  private topicTitles = new Map<number, string>()

  constructor(
    private readonly source: NotificationSource,
    readonly store: TelegramNotificationStore,
    private readonly onError: (failed: boolean) => void = () => {},
    private readonly devReplayRun?: string,
  ) {}

  private get signal() {
    return AbortSignal.any([this.controller.signal, this.source.signal])
  }
  private active = () => !this.controller.signal.aborted && !this.source.signal.aborted

  private enqueue(task: () => Promise<void>) {
    const next = this.queue.then(async () => {
      if (this.active()) await task()
    })
    this.queue = next.catch(() => {
      if (this.active()) this.onError(true)
    })
    return next
  }

  start() {
    // Subscribe before the initial scan so arrivals/edits during pagination queue behind it.
    this.unsubscribe = this.source.subscribeMessages(event => this.receive(event))
    void this.collect().catch(() => {})
    this.timer = setInterval(() => {
      void this.collect(false).catch(() => {})
    }, 60_000)
  }

  private receive(event: TelegramMessageEvent) {
    if (event.type === 'recover') {
      void this.collect().catch(() => {})
      return
    }
    void this.enqueue(async () => {
      if (event.type === 'deleted') {
        await this.store.removeSources(event.ids, this.active)
      } else {
        const checkpoint = await this.store.checkpoint()
        // A failed first scan must still seed from history, not from an arbitrary live event.
        if (!checkpoint) return
        const items = await this.project([event.record])
        await this.store.merge(items, {
          onlyExisting: event.edited || event.record.view.id <= checkpoint.lastMessageId,
          active: this.active,
        })
      }
    }).catch(() => {})
  }

  private async project(records: MessageRecord[]) {
    const eligible = records.filter(record => eligibleNotification(record.view, this.source.accountId))
    for (const id of new Set(eligible.map(record => record.view.topicId))) {
      if (id === null || this.topicTitles.has(id)) continue
      try {
        const topic = await this.source.fetchTopic(id, this.signal)
        if (topic) this.topicTitles.set(id, topic.title)
      } catch {
        this.signal.throwIfAborted()
        // A deleted or unavailable topic must not prevent retaining the message.
      }
    }
    return eligible.map(({ view }) => ({
      message: view,
      topicTitle:
        view.topicId === null
          ? undefined
          : (this.topicTitles.get(view.topicId) ?? (view.topicId === 1 ? 'General' : `Topic ${view.topicId}`)),
    }))
  }

  collect(revalidate = true) {
    if (revalidate) ++this.requestedRevalidation
    if (this.collecting) return this.collecting
    const operation = this.enqueue(async () => {
      await this.store.database.open()
      const checkpoint = await this.store.checkpoint()
      const replay = !!this.devReplayRun && !this.replayed
      let before: HistoryCursor | null = null
      let newestId = checkpoint?.lastMessageId ?? 0
      const records = new Map<number, MessageRecord>()
      while (true) {
        this.signal.throwIfAborted()
        const page = await this.source.fetchNotificationHistory(before, this.signal)
        newestId = Math.max(newestId, page.newestId)
        for (const record of page.items) {
          if (eligibleNotification(record.view, this.source.accountId) && !records.has(record.view.id))
            records.set(record.view.id, record)
        }
        const seeded = records.size >= 3
        const caughtUp = !checkpoint || !page.nextBefore || page.nextBefore.id <= checkpoint.lastMessageId
        if ((!checkpoint ? seeded : caughtUp) && (!replay || seeded)) break
        if (!page.nextBefore) break
        if (before && page.nextBefore.id >= before.id) throw new Error('Telegram history did not advance')
        before = page.nextBefore
      }
      this.signal.throwIfAborted()
      const ordered = [...records.values()].sort((a, b) => b.view.id - a.view.id)
      const collected = checkpoint
        ? ordered.filter(record => record.view.id > checkpoint.lastMessageId)
        : ordered.slice(0, 3)
      const items = await this.project(collected)
      // Only a fully successful scan advances the cursor. Realtime never advances it.
      await this.store.merge(items, { checkpoint: newestId, active: this.active })
      if (replay) {
        const recent = ordered.slice(0, 3)
        await this.store.merge(await this.project(recent), {
          onlyExisting: true,
          devReplayRun: this.devReplayRun,
          replayIds: recent.map(record => record.view.id),
          active: this.active,
        })
        this.replayed = true
      }
      while (this.completedRevalidation < this.requestedRevalidation) {
        const version = this.requestedRevalidation
        const visible = (await this.store.visible(this.devReplayRun)).filter(row => !row.deleted)
        for (let offset = 0; offset < visible.length; offset += 50) {
          const ids = visible.slice(offset, offset + 50).map(row => row.id)
          const refreshed = await this.source.fetchNotificationMessages(ids, this.signal)
          await this.store.merge(await this.project(refreshed), { onlyExisting: true, active: this.active })
          const found = new Set(refreshed.map(record => record.view.id))
          await this.store.removeSources(
            ids.filter(id => !found.has(id)),
            this.active,
          )
        }
        // Failed refreshes stay pending for the next periodic scan. A reconnect during this
        // refresh increments the requested version and gets another pass before settling.
        this.completedRevalidation = version
      }
      if (this.active()) this.onError(false)
    })
    this.collecting = operation.finally(() => {
      this.collecting = undefined
    })
    return this.collecting
  }

  stop() {
    this.controller.abort()
    clearInterval(this.timer)
    this.unsubscribe()
  }
}
