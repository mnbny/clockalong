import type { TelegramChatCache } from './chat-cache'
import type { SavedTelegramGroup } from './group'

import { type BaseTelegramClient, type RawUpdateInfo, type tl } from '@mtcute/web'

import { matchesPeer, projectMessage } from './chat-data'

export function subscribeChatUpdates(
  client: BaseTelegramClient,
  group: SavedTelegramGroup,
  cache: TelegramChatCache,
  active: () => boolean,
  refreshAccess: () => Promise<void>,
  onConnection: (state: 'offline' | 'connecting' | 'updating' | 'connected') => void = () => {},
) {
  let interrupted = false
  const raw = ({ update, peers }: RawUpdateInfo) => {
    if (!active()) return
    if (update._ === 'updateMessageID') {
      void cache.confirmSend(update.randomId.toString(), update.id)
      return
    }
    if (
      update._ === 'updateNewMessage' ||
      update._ === 'updateNewChannelMessage' ||
      update._ === 'updateEditMessage' ||
      update._ === 'updateEditChannelMessage'
    ) {
      const message = update.message
      if (message._ === 'messageEmpty' || !matchesPeer(group, message.peerId)) return
      const projected = projectMessage(group, message, peers)
      if (projected) void cache.upsert(projected)
      if (message._ === 'messageService') void refreshAccess()
      return
    }
    if (update._ === 'updateDeleteChannelMessages') {
      if (group.kind === 'supergroup' && update.channelId === Number(group.id)) void cache.remove(update.messages)
      return
    }
    if (update._ === 'updateDeleteMessages') {
      if (group.kind === 'basic') {
        const known = update.messages.filter(
          id => !!cache.findMessage(id) || cache.outgoing().some(item => item.serverId === id),
        )
        if (known.length) void cache.remove(known)
        if (known.length !== update.messages.length) void cache.recover()
      }
      return
    }
    if (update._ === 'updateReadHistoryInbox' || update._ === 'updateReadHistoryOutbox') {
      if (matchesPeer(group, update.peer)) cache.refreshMetadata()
      return
    }
    if (update._ === 'updateUserName' || update._ === 'updateUser') {
      if (cache.hasSender(`user:${update.userId}`)) cache.refreshAuthors()
      return
    }
    const selected =
      'channelId' in update
        ? group.kind === 'supergroup' && update.channelId === Number(group.id)
        : 'chatId' in update
          ? group.kind === 'basic' && update.chatId === Number(group.id)
          : 'peer' in update && update.peer && typeof update.peer === 'object' && '_' in update.peer
            ? matchesPeer(group, update.peer as tl.TypePeer)
            : false
    if (!selected) return
    cache.refreshMetadata()
    if (
      update._ === 'updateChannel' ||
      update._ === 'updateChat' ||
      update._ === 'updateChannelParticipant' ||
      update._ === 'updateChatParticipant'
    )
      void refreshAccess()
  }
  const connection = (state: 'offline' | 'connecting' | 'updating' | 'connected') => {
    if (!active()) return
    onConnection(state)
    if (state !== 'connected') interrupted = true
    else if (interrupted) {
      interrupted = false
      void cache.recover()
    }
  }
  client.onRawUpdate.add(raw)
  client.onConnectionState.add(connection)
  return () => {
    client.onRawUpdate.remove(raw)
    client.onConnectionState.remove(connection)
  }
}
