import { type BaseTelegramClient, Long, tl } from '@mtcute/web'

export type SavedTelegramGroup = { version: 1; accountId: string; title: string } & (
  | { kind: 'basic'; id: string }
  | { kind: 'supergroup'; id: string; accessHash: string; forum: boolean }
)
export type TelegramGroupState = {
  group: { title: string; id: string; hasTopics: boolean } | null
  status: 'none' | 'connected' | 'unavailable'
  error?: string
}
export class TelegramGroupError extends Error {}

export function groupIdentity(group: SavedTelegramGroup) {
  return {
    title: group.title,
    id: String(group.kind === 'basic' ? -Number(group.id) : -1000000000000 - Number(group.id)),
    hasTopics: group.kind === 'supergroup' && group.forum,
  }
}

function record(chat: tl.TypeChat, accountId: string): SavedTelegramGroup {
  if (chat._ === 'chat' && (chat.migratedTo || chat.deactivated))
    throw new TelegramGroupError('This group changed. Unlink it and reconnect using its current invite link.')
  if (chat._ === 'chat' && !chat.left)
    return { version: 1, accountId, kind: 'basic', id: String(chat.id), title: chat.title }
  if (
    chat._ === 'channel' &&
    !chat.min &&
    chat.megagroup &&
    !chat.broadcast &&
    !chat.gigagroup &&
    !chat.monoforum &&
    !chat.left &&
    !chat.bannedRights?.viewMessages &&
    chat.accessHash &&
    !chat.accessHash.isZero()
  )
    return {
      version: 1,
      accountId,
      kind: 'supergroup',
      id: String(chat.id),
      title: chat.title,
      accessHash: chat.accessHash.toString(),
      forum: !!chat.forum,
    }
  throw new TelegramGroupError(
    'Use a group you already belong to. Broadcast channels and inaccessible groups are not supported.',
  )
}

export async function verifyGroup(client: BaseTelegramClient, saved: SavedTelegramGroup, accountId: string) {
  if (saved.version !== 1 || saved.accountId !== accountId)
    throw new TelegramGroupError('This group belongs to a different login. Unlink it and connect again.')
  const id = Number(saved.id)
  if (!/^[1-9]\d*$/.test(saved.id) || !Number.isSafeInteger(id) || id > Number.MAX_SAFE_INTEGER - 1000000000000)
    throw new TelegramGroupError('This saved group is invalid. Unlink it and connect again.')
  let response: tl.messages.TypeChats
  if (saved.kind === 'basic') response = await client.call({ _: 'messages.getChats', id: [id] })
  else {
    if (
      !/^-?\d+$/.test(saved.accessHash) ||
      BigInt(saved.accessHash) < -(1n << 63n) ||
      BigInt(saved.accessHash) >= 1n << 63n ||
      BigInt(saved.accessHash) === 0n
    )
      throw new TelegramGroupError('This saved group is invalid. Unlink it and connect again.')
    response = await client.call({
      _: 'channels.getChannels',
      id: [{ _: 'inputChannel', channelId: id, accessHash: Long.fromString(saved.accessHash) }],
    })
  }
  const chat = response.chats.find(
    chat => chat.id === id && (saved.kind === 'basic' ? chat._ === 'chat' : chat._ === 'channel'),
  )
  if (!chat) throw new TelegramGroupError('This group is unavailable. Retry, or unlink it and connect again.')
  return record(chat, accountId)
}

export async function resolveGroup(client: BaseTelegramClient, link: string, accountId: string) {
  const match = /^(?:https?:\/\/)?t\.me\/(?:\+|joinchat\/)([A-Za-z0-9_-]+)\/?$/.exec(link.trim())
  if (!match) throw new TelegramGroupError('Paste a Telegram group invite link: t.me/+… or t.me/joinchat/….')
  const invite = await client.call({ _: 'messages.checkChatInvite', hash: match[1] })
  if (invite._ !== 'chatInviteAlready')
    throw new TelegramGroupError('Join this group in Telegram first, then try again.')
  return verifyGroup(client, record(invite.chat, accountId), accountId)
}

export function groupError(error: unknown) {
  if (error instanceof TelegramGroupError) return error.message
  if (tl.RpcError.is(error, 'INVITE_HASH_EXPIRED') || tl.RpcError.is(error, 'INVITE_HASH_INVALID'))
    return 'This invite link is invalid or expired. Ask for a current link.'
  return 'Could not verify the group. Check your connection and retry.'
}
