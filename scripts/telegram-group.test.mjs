import { Long } from '@mtcute/web'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { groupIdentity, resolveGroup, verifyGroup } from '../src/services/telegram/group.ts'

const basic = { _: 'chat', id: 123, title: 'Team' }
const channel = {
  _: 'channel',
  id: 456,
  title: 'Team',
  megagroup: true,
  accessHash: Long.fromString('-9223372036854775807'),
}
function clientFor(chat, inviteType = 'chatInviteAlready') {
  const calls = []
  return {
    calls,
    async call(request) {
      calls.push(request)
      if (request._ === 'messages.checkChatInvite') return { _: inviteType, chat }
      if (request._ === 'messages.getChats' || request._ === 'channels.getChannels')
        return { _: 'messages.chats', chats: [chat] }
      throw new Error('Unexpected RPC')
    },
  }
}

for (const chat of [basic, channel, { ...channel, forum: true }]) {
  test(`connect and restore ${chat._} forum=${!!chat.forum} using targeted metadata only`, async () => {
    const client = clientFor(chat)
    const saved = await resolveGroup(client, 'https://t.me/+invite_hash', '1')
    assert.equal(groupIdentity(saved).hasTopics, !!chat.forum)
    assert.equal(groupIdentity(saved).id, chat._ === 'chat' ? '-123' : '-1000000000456')
    assert.deepEqual(
      client.calls.map(call => call._),
      ['messages.checkChatInvite', chat._ === 'chat' ? 'messages.getChats' : 'channels.getChannels'],
    )
    const restarted = clientFor(chat)
    await verifyGroup(restarted, JSON.parse(JSON.stringify(saved)), '1')
    assert.equal(restarted.calls.length, 1)
    if (chat._ === 'channel')
      assert.equal(restarted.calls[0].id[0].accessHash.toString(), channel.accessHash.toString())
    else assert.deepEqual(restarted.calls[0].id, [123])
  })
}
for (const type of ['chatInvite', 'chatInvitePeek']) {
  test(`reject ${type} without fetching metadata`, async () => {
    const client = clientFor(channel, type)
    await assert.rejects(resolveGroup(client, 't.me/joinchat/invite', '1'), /Join this group/)
    assert.equal(client.calls.length, 1)
  })
}
for (const chat of [
  { ...basic, left: true },
  { ...basic, deactivated: true },
  { ...basic, migratedTo: {} },
  { ...channel, left: true, username: 'public_group' },
  { ...channel, min: true },
  { ...channel, broadcast: true },
  { ...channel, gigagroup: true },
  { ...channel, monoforum: true },
  { ...channel, bannedRights: { viewMessages: true } },
  { ...channel, accessHash: Long.ZERO },
  { _: 'chatForbidden', id: 123, title: 'Team' },
  { _: 'chatEmpty', id: 123 },
]) {
  test(`reject inaccessible or unsupported metadata ${JSON.stringify(chat)}`, async () => {
    await assert.rejects(resolveGroup(clientFor(chat), 't.me/+invite', '1'))
  })
}

test('restart refreshes forum metadata and rejects another account', async () => {
  const saved = await resolveGroup(clientFor(channel), 't.me/+invite', '1')
  const refreshed = await verifyGroup(clientFor({ ...channel, forum: true }), saved, '1')
  assert.equal(groupIdentity(refreshed).hasTopics, true)
  const client = clientFor(channel)
  await assert.rejects(verifyGroup(client, saved, '2'), /different login/)
  assert.equal(client.calls.length, 0)
})

test('reject message links and usernames without RPCs', async () => {
  const client = clientFor(channel)
  for (const link of ['t.me/c/123/456', 't.me/public_group', 'https://evil.test/+invite'])
    await assert.rejects(resolveGroup(client, link, '1'))
  assert.equal(client.calls.length, 0)
})
