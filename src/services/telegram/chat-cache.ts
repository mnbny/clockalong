import type { GroupSummary, HistoryPage, MessageRecord, TopicPage } from './chat-data'
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'

import { queryKeys } from '../../lib/query-client'

export class TelegramChatCache {
  private queue = Promise.resolve()
  private metadataTimer: ReturnType<typeof setTimeout> | undefined
  // Tombstones contain IDs only and prevent an older send response reviving a deletion.
  private deleted = new Set<number>()
  constructor(
    private readonly query: QueryClient,
    readonly scope: string,
    private readonly active: () => boolean,
  ) {}

  keys = {
    summary: () => queryKeys.telegram.summary({ other: [this.scope] }),
    topics: () => queryKeys.telegram.topics({ other: [this.scope] }),
    history: (topicId: number | null) => queryKeys.telegram.history({ params: { topicId }, other: [this.scope] }),
  }
  private owns(key: QueryKey) {
    return key[0] === 'telegram' && key[key.length - 1] === this.scope
  }
  private histories() {
    return this.query
      .getQueryCache()
      .findAll({ predicate: query => this.owns(query.queryKey) && query.queryKey[1] === 'history' })
  }
  isDeleted(id: number) {
    return this.deleted.has(id)
  }
  findMessage(id: number) {
    for (const query of this.histories()) {
      const data = query.state.data as InfiniteData<HistoryPage> | undefined
      const found = data?.pages.flatMap(page => page.items).find(item => item.view.id === id)
      if (found) return found
    }
  }
  hasSender(id: string) {
    return this.histories().some(query =>
      (query.state.data as InfiniteData<HistoryPage> | undefined)?.pages.some(page =>
        page.items.some(item => item.view.sender && `${item.view.sender.kind}:${item.view.sender.id}` === id),
      ),
    )
  }
  topic(id: number) {
    return this.query
      .getQueryData<InfiniteData<TopicPage>>(this.keys.topics())
      ?.pages.flatMap(page => page.items)
      .find(topic => topic.id === id)
  }
  setSummary(summary: GroupSummary) {
    if (this.active()) this.query.setQueryData(this.keys.summary(), summary)
  }
  summary() {
    return this.query.getQueryData<GroupSummary>(this.keys.summary())
  }
  private enqueue(task: () => Promise<void>) {
    const next = this.queue.then(async () => {
      if (this.active()) await task()
    })
    this.queue = next.catch(() => {})
    return next
  }
  refreshMetadata() {
    if (!this.active() || this.metadataTimer !== undefined) return
    this.metadataTimer = setTimeout(() => {
      this.metadataTimer = undefined
      if (!this.active()) return
      void this.query.invalidateQueries({ queryKey: this.keys.summary() })
      void this.query.resetQueries({ queryKey: this.keys.topics() })
    }, 0)
  }
  upsert(record: MessageRecord) {
    return this.enqueue(async () => {
      const key = this.keys.history(record.view.topicId)
      await this.query.cancelQueries({ queryKey: key, exact: true })
      if (!this.active()) return
      this.refreshMetadata()
      if (this.deleted.has(record.view.id)) {
        void this.query.invalidateQueries({ queryKey: key, exact: true })
        return
      }
      const data = this.query.getQueryData<InfiniteData<HistoryPage>>(key)
      if (!data?.pages.length) {
        void this.query.invalidateQueries({ queryKey: key, exact: true })
        return
      }
      const known = data.pages.some(page => page.items.some(item => item.view.id === record.view.id))
      const head = data.pages.flatMap(page => page.items)[0]?.view.id ?? 0
      if (!known && record.view.id <= head) {
        void this.query.invalidateQueries({ queryKey: key, exact: true })
        return
      }
      const seen = new Set<number>()
      this.query.setQueryData<InfiniteData<HistoryPage>>(key, {
        ...data,
        pages: data.pages.map((page, index) => ({
          ...page,
          items: (!known && index === 0 ? [record, ...page.items] : page.items)
            .map(item =>
              item.view.id === record.view.id && (item.view.editDate ?? 0) <= (record.view.editDate ?? 0)
                ? record
                : item,
            )
            .filter(item => {
              if (seen.has(item.view.id)) return false
              seen.add(item.view.id)
              return true
            }),
        })),
      })
    })
  }
  remove(ids: number[]) {
    ids.forEach(id => this.deleted.add(id))
    return this.enqueue(async () => {
      const histories = this.histories()
      await Promise.all(histories.map(query => this.query.cancelQueries({ queryKey: query.queryKey, exact: true })))
      if (!this.active()) return
      for (const query of histories) {
        const topicId = (query.queryKey[2] as { topicId: number | null }).topicId
        if (topicId !== null && ids.includes(topicId)) {
          void this.query.resetQueries({ queryKey: query.queryKey, exact: true })
          continue
        }
        if (!query.state.data) {
          void this.query.invalidateQueries({ queryKey: query.queryKey, exact: true })
          continue
        }
        this.query.setQueryData<InfiniteData<HistoryPage>>(query.queryKey, data =>
          data
            ? {
                ...data,
                pages: data.pages.map(page => ({
                  ...page,
                  items: page.items.filter(item => !this.deleted.has(item.view.id)),
                })),
              }
            : data,
        )
      }
      this.refreshMetadata()
    })
  }
  recover() {
    return this.enqueue(async () => {
      await this.query.cancelQueries({ predicate: query => this.owns(query.queryKey) })
      if (!this.active()) return
      // Reset drops every old cursor, including inactive histories, before fetching newest.
      void this.query.resetQueries({ predicate: query => this.owns(query.queryKey) })
    })
  }
  refreshAuthors() {
    if (!this.active()) return
    void this.query.invalidateQueries({
      predicate: query =>
        this.owns(query.queryKey) && (query.queryKey[1] === 'avatar' || query.queryKey[1] === 'history'),
    })
  }
  dispose() {
    clearTimeout(this.metadataTimer)
    this.deleted.clear()
    void this.query.cancelQueries({ predicate: query => this.owns(query.queryKey) })
    this.query.removeQueries({ predicate: query => this.owns(query.queryKey) })
    for (const mutation of this.query.getMutationCache().getAll())
      if (mutation.options.mutationKey && this.owns(mutation.options.mutationKey))
        this.query.getMutationCache().remove(mutation)
  }
}
