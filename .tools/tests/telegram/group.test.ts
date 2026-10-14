import { type BaseTelegramClient, Long, type tl } from '@mtcute/web'
import { expect, test } from 'vitest'

import { groupIdentity, resolveGroup, verifyGroup } from '../../../src/services/telegram/group'

const basic: tl.RawChat = {
  _: 'chat',
  id: 123,
  title: 'Team',
  photo: { _: 'chatPhotoEmpty' },
  participantsCount: 2,
  date: 0,
  version: 1,
}
const channel: tl.RawChannel = {
  _: 'channel',
  id: 456,
  title: 'Team',
  photo: { _: 'chatPhotoEmpty' },
  date: 0,
  megagroup: true,
  accessHash: Long.fromString('-9223372036854775807'),
}
function clientFor(chat: tl.TypeChat, inviteType = 'chatInviteAlready') {
  const calls: tl.RpcMethod[] = []
  return {
    calls,
    async call(request: tl.RpcMethod) {
      calls.push(request)
      if (request._ === 'messages.checkChatInvite') return { _: inviteType, chat }
      if (request._ === 'messages.getChats' || request._ === 'channels.getChannels')
        return { _: 'messages.chats', chats: [chat] }
      throw new Error('Unexpected RPC')
    },
  } as unknown as BaseTelegramClient & { calls: tl.RpcMethod[] }
}

for (const chat of [basic, channel, { ...channel, forum: true }]) {
  test(`connect and restore ${chat._} forum=${'forum' in chat && !!chat.forum} using targeted metadata only`, async () => {
    const client = clientFor(chat)
    const saved = await resolveGroup(client, 'https://t.me/+invite_hash', '1')
    expect(groupIdentity(saved).hasTopics).toBe('forum' in chat && !!chat.forum)
    expect(groupIdentity(saved).id).toBe(chat._ === 'chat' ? '-123' : '-1000000000456')
    expect(client.calls.map(call => call._)).toStrictEqual([
      'messages.checkChatInvite',
      chat._ === 'chat' ? 'messages.getChats' : 'channels.getChannels',
    ])
    const restarted = clientFor(chat)
    await verifyGroup(restarted, JSON.parse(JSON.stringify(saved)), '1')
    expect(restarted.calls.length).toBe(1)
    const request = restarted.calls[0]
    if (request._ === 'channels.getChannels') {
      expect(request.id).toStrictEqual([{ _: 'inputChannel', channelId: 456, accessHash: channel.accessHash }])
    } else {
      expect(request).toStrictEqual({ _: 'messages.getChats', id: [123] })
    }
  })
}
for (const type of ['chatInvite', 'chatInvitePeek']) {
  test(`reject ${type} without fetching metadata`, async () => {
    const client = clientFor(channel, type)
    await expect(resolveGroup(client, 't.me/joinchat/invite', '1')).rejects.toThrow(/Join this group/)
    expect(client.calls.length).toBe(1)
  })
}
for (const chat of [
  { ...basic, left: true },
  { ...basic, deactivated: true },
  { ...basic, migratedTo: { _: 'inputChannel', channelId: 456, accessHash: Long.ONE } },
  { ...channel, left: true, username: 'public_group' },
  { ...channel, min: true },
  { ...channel, broadcast: true },
  { ...channel, gigagroup: true },
  { ...channel, monoforum: true },
  { ...channel, bannedRights: { _: 'chatBannedRights', viewMessages: true, untilDate: 0 } },
  { ...channel, accessHash: Long.ZERO },
  { _: 'chatForbidden', id: 123, title: 'Team' },
  { _: 'chatEmpty', id: 123 },
] satisfies tl.TypeChat[]) {
  test(`reject inaccessible or unsupported metadata ${JSON.stringify(chat)}`, async () => {
    await expect(resolveGroup(clientFor(chat), 't.me/+invite', '1')).rejects.toThrow()
  })
}

test('restart refreshes forum metadata and rejects another account', async () => {
  const saved = await resolveGroup(clientFor(channel), 't.me/+invite', '1')
  const refreshed = await verifyGroup(clientFor({ ...channel, forum: true }), saved, '1')
  expect(groupIdentity(refreshed).hasTopics).toBe(true)
  const client = clientFor(channel)
  await expect(verifyGroup(client, saved, '2')).rejects.toThrow(/different login/)
  expect(client.calls.length).toBe(0)
})

test('reject message links and usernames without RPCs', async () => {
  const client = clientFor(channel)
  for (const link of ['t.me/c/123/456', 't.me/public_group', 'https://evil.test/+invite'])
    await expect(resolveGroup(client, link, '1')).rejects.toThrow()
  expect(client.calls.length).toBe(0)
})
