import type { Conversation, HistoryCursor, TopicCursor } from './chat-data'

import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { queryKeys } from '../../lib/query-client'
import { type OutgoingMessage, type SendOperation, type TelegramChat, TelegramChatError } from './chat'
import { useTelegram } from './session-provider'

const readDefaults = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  structuralSharing: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  networkMode: 'always' as const,
  retry: (attempt: number, error: Error) =>
    attempt < 1 && error instanceof TelegramChatError && error.category === 'network',
}
function requireChat(chat: TelegramChat | null) {
  if (!chat?.isReady) throw new TelegramChatError('unavailable')
  return chat
}
export function telegramHistoryOptions(chat: TelegramChat | null, conversation: Conversation) {
  return infiniteQueryOptions({
    ...readDefaults,
    queryKey: queryKeys.telegram.history({ params: conversation, other: [chat?.scope ?? 'unavailable'] }),
    enabled: !!chat?.isReady,
    initialPageParam: null as HistoryCursor | null,
    queryFn: ({ pageParam, signal }) => requireChat(chat).fetchHistory(conversation, pageParam, signal),
    getNextPageParam: page => page.nextBefore,
  })
}
export function telegramTopicsOptions(chat: TelegramChat | null) {
  return infiniteQueryOptions({
    ...readDefaults,
    queryKey: queryKeys.telegram.topics({ other: [chat?.scope ?? 'unavailable'] }),
    enabled: !!chat?.isReady && chat.forum,
    initialPageParam: null as TopicCursor | null,
    queryFn: ({ pageParam, signal }) => requireChat(chat).fetchTopics(pageParam, signal),
    getNextPageParam: page => page.nextOffset,
  })
}
export function telegramSummaryOptions(chat: TelegramChat | null) {
  return queryOptions({
    ...readDefaults,
    queryKey: queryKeys.telegram.summary({ other: [chat?.scope ?? 'unavailable'] }),
    enabled: !!chat?.isReady,
    queryFn: ({ signal }) => requireChat(chat).fetchSummary(signal),
  })
}
export function useTelegramHistory(conversation: Conversation) {
  const { chat } = useTelegram()
  return useInfiniteQuery(telegramHistoryOptions(chat, conversation))
}
export function useTelegramTopics(enabled = true) {
  const { chat } = useTelegram()
  return useInfiniteQuery({
    ...telegramTopicsOptions(chat),
    enabled: enabled && !!chat?.isReady && chat.forum,
  })
}
export function useTelegramChatPreload(enabled: boolean) {
  const { chat } = useTelegram()
  const query = useQueryClient()
  const topics = useTelegramTopics(enabled)
  useEffect(() => {
    if (enabled && topics.hasNextPage && !topics.isFetching && !topics.isError) void topics.fetchNextPage()
  }, [enabled, topics.hasNextPage, topics.isFetching, topics.isError, topics.fetchNextPage])
  useEffect(() => {
    if (!enabled || !chat?.isReady) return
    const conversations = chat.forum
      ? (topics.data?.pages.flatMap(page =>
          page.items.filter(topic => !topic.hidden).map(topic => ({ topicId: topic.id })),
        ) ?? [])
      : [{ topicId: null }]
    let stopped = false
    void (async () => {
      // Serialize preloads to avoid a burst of Telegram history requests.
      for (const conversation of conversations) {
        if (stopped || chat.signal.aborted) return
        const options = telegramHistoryOptions(chat, conversation)
        const state = query.getQueryState(options.queryKey)
        if (!state?.data && state?.status !== 'error') await query.prefetchInfiniteQuery({ ...options, pages: 1 })
      }
    })()
    return () => {
      stopped = true
    }
  }, [enabled, chat, topics.data, query])
}
export function useTelegramSummary() {
  return useQuery(telegramSummaryOptions(useTelegram().chat))
}
export function useTelegramTopic(topicId: number | null, enabled: boolean) {
  const { chat } = useTelegram()
  return useQuery({
    ...readDefaults,
    queryKey: queryKeys.telegram.topic({
      params: { topicId: topicId ?? undefined },
      other: [chat?.scope ?? 'unavailable'],
    }),
    enabled: enabled && !!chat?.isReady && chat.forum && topicId !== null,
    queryFn: ({ signal }) => requireChat(chat).fetchTopic(topicId!, signal),
  })
}
export function useTelegramReply(messageId: number, enabled: boolean) {
  const { chat } = useTelegram()
  return useQuery({
    ...readDefaults,
    queryKey: queryKeys.telegram.reply({ params: { messageId }, other: [chat?.scope ?? 'unavailable'] }),
    enabled: enabled && !!chat?.isReady,
    queryFn: ({ signal }) => requireChat(chat).fetchReply(messageId, signal),
  })
}
export function useTelegramAvatar(messageId: number) {
  const { chat } = useTelegram()
  const ref = chat?.cache.findMessage(messageId)?.avatar
  return useQuery({
    ...readDefaults,
    staleTime: Infinity,
    queryKey: queryKeys.telegram.avatar({
      params: { senderId: ref?.senderId, photoId: ref?.photoId, size: 'small' },
      other: [chat?.scope ?? 'unavailable'],
    }),
    enabled: !!chat?.isReady && !!ref,
    queryFn: ({ signal }) => requireChat(chat).avatar(messageId, signal),
  })
}
export function useTelegramPreview(messageId: number) {
  const { chat } = useTelegram()
  const ref = chat?.cache.findMessage(messageId)?.preview
  return useQuery({
    ...readDefaults,
    staleTime: Infinity,
    queryKey: queryKeys.telegram.attachment({
      params: { messageId, mediaId: ref?.mediaId, size: 'preview' },
      other: [chat?.scope ?? 'unavailable'],
    }),
    enabled: !!chat?.isReady && !!ref,
    queryFn: ({ signal }) => requireChat(chat).preview(messageId, signal),
  })
}
export function useTelegramBlobUrl(blob: Blob | null | undefined) {
  const { chat } = useTelegram()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob || !chat?.isReady) {
      setUrl(null)
      return
    }
    const created = URL.createObjectURL(blob)
    setUrl(created)
    const revoke = () => {
      URL.revokeObjectURL(created)
      setUrl(null)
    }
    chat.signal.addEventListener('abort', revoke, { once: true })
    return () => {
      chat.signal.removeEventListener('abort', revoke)
      revoke()
    }
  }, [blob, chat])
  return url
}
export function telegramSendOptions(chat: TelegramChat | null, onStarted?: (operation: SendOperation) => void) {
  return mutationOptions({
    mutationKey: queryKeys.telegram.send({ other: [chat?.scope ?? 'unavailable'] }),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (input: {
      operation: SendOperation
      signal?: AbortSignal
      onProgress?: (done: number, total: number) => void
    }) =>
      requireChat(chat).send(input.operation, {
        signal: input.signal,
        onProgress: (done, total) => {
          chat?.cache.updateSend(input.operation.id, { progress: Math.round((done / total) * 100) })
          input.onProgress?.(done, total)
        },
      }),
    onMutate: input => {
      requireChat(chat).beginSend(input.operation)
      onStarted?.(input.operation)
    },
    onSuccess: (record, input) => chat?.cache.upsert(record, input.operation.id),
    onError: (error, input) => chat?.cache.updateSend(input.operation.id, { error }),
  })
}
export function useTelegramSend(onStarted?: (operation: SendOperation) => void) {
  const { chat } = useTelegram()
  const mutation = useMutation(telegramSendOptions(chat, onStarted))
  useEffect(() => {
    mutation.reset()
  }, [chat, mutation.reset])
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) mutation.reset()
  }, [mutation.isSuccess, mutation.isError, mutation.reset])
  return mutation
}
export function useTelegramOutgoing() {
  const { chat } = useTelegram()
  return useQuery({
    queryKey: queryKeys.telegram.outgoing({ other: [chat?.scope ?? 'unavailable'] }),
    queryFn: skipToken,
    initialData: [] as OutgoingMessage[],
    gcTime: Infinity,
    staleTime: Infinity,
    structuralSharing: false,
  })
}
export function telegramReadOptions(chat: TelegramChat | null) {
  return mutationOptions({
    mutationKey: queryKeys.telegram.read({ other: [chat?.scope ?? 'unavailable'] }),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (input: Conversation & { maxId: number }) => requireChat(chat).acknowledgeRead(input, input.maxId),
    onSuccess: () => chat?.cache.refreshMetadata(),
  })
}
export function useTelegramRead() {
  const { chat } = useTelegram()
  const mutation = useMutation(telegramReadOptions(chat))
  useEffect(() => {
    mutation.reset()
  }, [chat, mutation.reset])
  return mutation
}
export function useTelegramDownload(onStarted?: () => void) {
  const { chat } = useTelegram()
  const mutation = useMutation({
    mutationKey: queryKeys.telegram.attachment({ other: [chat?.scope ?? 'unavailable'] }),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (input: {
      messageId: number
      signal?: AbortSignal
      onProgress?: (done: number, total: number) => void
    }) => requireChat(chat).saveDownload(input.messageId, input),
    onMutate: onStarted,
  })
  useEffect(() => {
    mutation.reset()
  }, [chat, mutation.reset])
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) mutation.reset()
  }, [mutation.isSuccess, mutation.isError, mutation.reset])
  return mutation
}
