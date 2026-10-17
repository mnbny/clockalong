import type { McpTelegramCommand, McpTelegramDestinations, McpTelegramMessageResult } from '../tauri/mcp-client'
import type { TelegramChat } from '../telegram/chat'
import type { TopicCursor } from '../telegram/chat-data'
import type { AttachmentInput } from '../telegram/chat-files'
import type { TelegramGroupState } from '../telegram/group'

import { queryClient } from '../../lib/query-client'
import { chatError } from '../../utils/telegram-chat'
import { mcp } from '../tauri/mcp-client'
import { TelegramChatError } from '../telegram/chat'
import { photoMime, probeVideo } from '../telegram/chat-files'
import { telegramSendOptions } from '../telegram/chat-queries'

export type McpTelegramContext = { chat: TelegramChat | null; group: TelegramGroupState; busy: boolean }
const uncertainDelivery =
  'Delivery could not be confirmed. The message may have been sent; check Telegram before retrying. Do not automatically resend.'
class McpTelegramError extends Error {}

export async function executeMcpTelegramCommand(
  command: McpTelegramCommand,
  current: () => McpTelegramContext,
): Promise<McpTelegramDestinations | McpTelegramMessageResult> {
  const context = current()
  const chat = context.chat
  const group = context.group.group
  const controller = new AbortController()
  const remaining = command.deadlineAt - Date.now() - (command.tool === 'send_telegram_message' ? 10_000 : 1_000)
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw new McpTelegramError('This Telegram request expired. Nothing was started.')
  const timer = setTimeout(() => controller.abort(), remaining)
  const signal = controller.signal
  const check = () => {
    signal.throwIfAborted()
    const next = current()
    if (
      !chat?.isReady ||
      !group ||
      next.chat !== chat ||
      next.group.group?.id !== group.id ||
      next.group.status !== 'connected' ||
      next.busy ||
      ['offline', 'connecting'].includes(chat.connection)
    ) {
      throw new McpTelegramError('Telegram is unavailable. Connect Telegram and select a group in Clockalong Settings.')
    }
  }

  try {
    check()
    if (!chat || !group) throw new McpTelegramError('Telegram is unavailable.')
    if (command.tool === 'list_telegram_destinations') {
      const summary = await chat.fetchSummary(signal)
      check()
      const destinations: McpTelegramDestinations['destinations'] = []
      if (chat.forum) {
        let offset: TopicCursor | null = null
        const seen = new Set<number>()
        do {
          const page = await chat.fetchTopics(offset, signal)
          check()
          for (const topic of page.items) {
            if (!topic.hidden && !seen.has(topic.id)) {
              destinations.push({ topicId: topic.id, title: topic.title, closed: topic.closed })
              seen.add(topic.id)
            }
          }
          offset = page.nextOffset ?? null
        } while (offset)
      } else {
        destinations.push({ topicId: null, title: summary.title, closed: false })
      }
      // Project only the selected group's public fields, never SDK peers or provider state.
      return { group: { id: group.id, title: summary.title, hasTopics: chat.forum }, destinations }
    }

    const args = command.arguments
    if (args.groupId !== group.id)
      throw new McpTelegramError('That group is not selected. Call list_telegram_destinations again.')
    if (chat.forum ? !Number.isInteger(args.topicId) || args.topicId! < 1 : args.topicId !== null)
      throw new McpTelegramError('That topic is unavailable. Call list_telegram_destinations again.')
    if (!args.text?.trim() && !args.fileName) throw new McpTelegramError('Supply text or one file.')
    const summary = await chat.fetchSummary(signal)
    check()
    chat.cache.setSummary(summary)
    if (args.topicId !== null) {
      const topic = await chat.fetchTopic(args.topicId, signal)
      check()
      if (!topic || topic.hidden)
        throw new McpTelegramError('That topic is unavailable. Call list_telegram_destinations again.')
      chat.cache.setTopic(topic)
      if (topic.closed && !summary.canSendInClosedTopics) throw new TelegramChatError('restricted')
    }
    if (!args.fileName && summary.canSendText === false) throw new TelegramChatError('restricted')
    let attachment: AttachmentInput | undefined
    if (args.fileName) {
      let bytes: ArrayBuffer
      try {
        bytes = await mcp.readTelegramAttachment(command.requestId)
      } catch {
        throw new McpTelegramError(
          'Could not read the attachment. Choose a readable, nonempty regular file of at most 20 MiB.',
        )
      }
      check()
      const photo = photoMime(new Uint8Array(bytes).subarray(0, 32))
      const mime = photo ?? (/\.(mp4|m4v)$/i.test(args.fileName) ? 'video/mp4' : 'application/octet-stream')
      const source = new Blob([bytes], { type: mime })
      const video = !args.asFile && mime === 'video/mp4' ? await probeVideo(source, signal) : undefined
      check()
      attachment = {
        source,
        name: args.fileName,
        mime,
        mode: !args.asFile && (photo || video) ? 'media' : 'original',
        video,
      }
    }
    check()
    const operation = chat.createSend({ topicId: args.topicId, text: args.text ?? '' }, attachment)
    const result = await queryClient
      .getMutationCache()
      .build(queryClient, telegramSendOptions(chat))
      .execute({ operation, signal })
    check()
    return { groupId: group.id, topicId: args.topicId, messageId: result.view.id }
  } catch (error) {
    if (error instanceof McpTelegramError) throw error
    if (signal.aborted || (error instanceof TelegramChatError && error.category === 'unknown-send'))
      throw new McpTelegramError(
        command.tool === 'send_telegram_message' ? uncertainDelivery : 'Telegram destination lookup timed out.',
      )
    throw new McpTelegramError(chatError(error))
  } finally {
    clearTimeout(timer)
  }
}
