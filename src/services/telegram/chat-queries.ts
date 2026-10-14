import type { Conversation, HistoryCursor, TopicCursor } from './chat-data'

import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { queryKeys } from '../../lib/query-client'
import { type SendOperation, type TelegramChat, TelegramChatError } from './chat'
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
export function useTelegramTopics() {
  const { chat } = useTelegram()
  return useInfiniteQuery(telegramTopicsOptions(chat))
}
export function useTelegramSummary() {
  return useQuery(telegramSummaryOptions(useTelegram().chat))
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
export function telegramSendOptions(chat: TelegramChat | null) {
  return mutationOptions({
    mutationKey: queryKeys.telegram.send({ other: [chat?.scope ?? 'unavailable'] }),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    mutationFn: (input: {
      operation: SendOperation
      signal?: AbortSignal
      onProgress?: (done: number, total: number) => void
    }) => requireChat(chat).send(input.operation, input),
    onSuccess: record => chat?.cache.upsert(record),
  })
}
export function useTelegramSend() {
  const { chat } = useTelegram()
  const mutation = useMutation(telegramSendOptions(chat))
  useEffect(() => {
    mutation.reset()
  }, [chat, mutation.reset])
  useEffect(() => {
    // Reset after observer callbacks so callers can clear their draft on success.
    if (mutation.isSuccess) mutation.reset()
  }, [mutation.isSuccess, mutation.reset])
  return mutation
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
export function useTelegramDownload() {
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
  })
  useEffect(() => {
    mutation.reset()
  }, [chat, mutation.reset])
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) mutation.reset()
  }, [mutation.isSuccess, mutation.isError, mutation.reset])
  return mutation
}
