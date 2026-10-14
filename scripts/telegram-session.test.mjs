import { BaseTelegramClient, tl } from '@mtcute/web'
import { QueryClient } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

import { auth } from '../src/services/tauri/auth-client.ts'
import { telegramGroup } from '../src/services/tauri/telegram-group-client.ts'
import { TelegramSession } from '../src/services/telegram/session.ts'

const user = { _: 'user', id: 1, firstName: 'Test', self: true }
const callbacks = { show() {}, password: async () => '', invalidPassword() {} }
let saved, events, credentials, login, save, remove, lookup

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  mock.restoreAll()
  globalThis.isTauri = true
  saved = false
  events = []
  credentials = { apiId: 1, apiHash: 'test-app-hash', session: null }
  login = async () => ({ _: 'auth.loginTokenSuccess' })
  lookup = async () => [user]
  save = async () => {
    events.push('save')
    saved = true
  }
  remove = async () => {
    events.push('delete')
    saved = false
  }
  mock.method(telegramGroup, 'read', async () => null)
  mock.method(telegramGroup, 'save', async () => {})
  mock.method(telegramGroup, 'remove', async () => {})
  mock.method(auth, 'getTelegramCredential', async () => credentials)
  mock.method(auth, 'connectTelegram', () => save())
  mock.method(auth, 'disconnectTelegram', () => remove())
  mock.method(auth, 'setTelegramUnavailable', async () => {
    events.push('unavailable')
  })
  mock.method(BaseTelegramClient.prototype, 'getApiCredentials', async () => ({ id: 1, hash: 'test-app-hash' }))
  mock.method(BaseTelegramClient.prototype, 'importSession', async () => {})
  mock.method(BaseTelegramClient.prototype, 'exportSession', async () => 'test-session')
  mock.method(BaseTelegramClient.prototype, 'notifyLoggedIn', async () => user)
  mock.method(BaseTelegramClient.prototype, 'notifyLoggedOut', async () => {})
  mock.method(BaseTelegramClient.prototype, 'destroy', async () => {
    events.push('destroy')
  })
  mock.method(BaseTelegramClient.prototype, 'call', async function (request) {
    if (request._ === 'auth.exportLoginToken') return login()
    if (request._ === 'users.getUsers') return lookup()
    if (request._ === 'auth.logOut') {
      events.push('logout')
      return {}
    }
    throw new Error('Unexpected request in login-only test')
  })
})

test('late QR completion after cancel never saves authorization', async () => {
  const pending = deferred()
  login = () => pending.promise
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  const connected = session.connect(callbacks)
  await new Promise(resolve => setImmediate(resolve))
  session.cancel()
  pending.resolve({ _: 'auth.loginTokenSuccess' })
  assert.equal(await connected, false)
  assert.equal(saved, false)
  assert.ok(events.includes('destroy'))
})

test('native save finishes before success and cannot be cancelled', async () => {
  const pending = deferred()
  save = async () => {
    events.push('save')
    await pending.promise
    saved = true
  }
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  const connected = session.connect(callbacks)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(session.cancel(), false)
  assert.equal(saved, false)
  pending.resolve()
  assert.equal(await connected, true)
  assert.equal(saved, true)
  assert.equal(session.cancel(), true)
  assert.ok(!events.includes('destroy'), 'closing a committed dialog keeps the connection')
  session.dispose()
})

test('failed save attempts remote logout, destroys client, and exposes no raw error', async () => {
  save = async () => {
    throw new Error('secret protocol payload')
  }
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await assert.rejects(session.connect(callbacks), {
    message: 'Could not save Telegram securely. Try connecting again.',
  })
  assert.ok(events.includes('logout'))
  assert.ok(events.includes('destroy'))
  assert.equal(saved, false)
})

test('disconnect deletes locally before remote logout', async () => {
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  await session.disconnect()
  assert.ok(events.indexOf('delete') < events.indexOf('logout'))
  assert.equal(saved, false)
})

test('failed local deletion reports failure without remote logout', async () => {
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  remove = async () => {
    throw new Error('disk unavailable')
  }
  await assert.rejects(session.disconnect(), /Could not remove/)
  assert.equal(saved, true)
  assert.ok(!events.includes('logout'))
  assert.ok(events.includes('destroy'))
})

test('restore network failure retains the stored session and clears public availability', async () => {
  credentials.session = 'saved-test-session'
  lookup = async () => {
    throw new Error('network unavailable')
  }
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await assert.rejects(session.restore(), /saved session is kept/)
  assert.ok(events.includes('unavailable'))
  assert.ok(!events.includes('delete'))
  assert.ok(events.includes('destroy'))
})

test('revoked sessions are deleted rather than retried indefinitely', async () => {
  credentials.session = 'revoked-test-session'
  const { tl } = await import('@mtcute/web')
  lookup = async () => {
    throw new tl.RpcError(401, 'SESSION_REVOKED')
  }
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await assert.rejects(session.restore(), /session expired/)
  assert.ok(events.includes('delete'))
  assert.ok(events.includes('destroy'))
})

test('missing app configuration creates no client or protocol request', async () => {
  credentials.apiId = null
  let reason
  const session = new TelegramSession(
    () => {},
    value => {
      reason = value
    },
  )
  await session.restore()
  assert.match(reason, /not configured/)
  assert.equal(BaseTelegramClient.prototype.call.mock.callCount(), 0)
})

const basic = { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Team' }

test('group restore failure preserves authenticated account and saved group for retry', async () => {
  credentials.session = 'saved-session'
  mock.method(telegramGroup, 'read', async () => basic)
  const states = []
  const session = new TelegramSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await session.restore()
  assert.equal(saved, true)
  assert.ok(!events.includes('unavailable'))
  assert.equal(states.at(-1).status, 'unavailable')
  assert.equal(telegramGroup.remove.mock.callCount(), 0)
  session.dispose()
})

test('fresh QR authorization removes old group first; failed removal prevents login', async () => {
  mock.method(telegramGroup, 'remove', async () => {
    throw new Error('private storage error')
  })
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await assert.rejects(session.connect(callbacks), /Could not connect/)
  assert.equal(BaseTelegramClient.prototype.call.mock.callCount(), 0)
})

test('no saved session discards an orphan group', async () => {
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await session.restore()
  assert.equal(telegramGroup.remove.mock.callCount(), 1)
})

test('failed unlink does not clear the selection or claim success', async () => {
  const states = []
  const session = new TelegramSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  mock.method(telegramGroup, 'remove', async () => {
    throw new Error('private storage error')
  })
  await assert.rejects(session.unlinkGroup(), /Could not remove/)
  assert.equal(states.at(-1).status, 'unavailable')
  assert.equal(states.at(-1).group, null)
})

test('pending group verification cannot race unlink or disconnect and disposed results never save', async () => {
  const pending = deferred()
  const session = new TelegramSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  mock.method(BaseTelegramClient.prototype, 'call', async request => {
    if (request._ === 'messages.checkChatInvite')
      return { _: 'chatInviteAlready', chat: { _: 'chat', id: 123, title: 'Team' } }
    assert.equal(request._, 'messages.getChats')
    return pending.promise
  })
  const connecting = session.connectGroup('https://t.me/+example')
  await assert.rejects(session.unlinkGroup(), /Wait/)
  await assert.rejects(session.disconnect(), /Wait/)
  session.dispose()
  pending.resolve({ _: 'messages.chats', chats: [{ _: 'chat', id: 123, title: 'Team' }] })
  await assert.rejects(connecting)
  assert.equal(telegramGroup.save.mock.callCount(), 0)
})

test('offline startup keeps safe group identity and permits local unlink', async () => {
  credentials.session = 'saved-session'
  mock.method(telegramGroup, 'read', async () => basic)
  lookup = async () => {
    throw new Error('offline')
  }
  const states = []
  const session = new TelegramSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await assert.rejects(session.restore())
  assert.equal(states.at(-1).group.title, 'Team')
  assert.equal(states.at(-1).status, 'unavailable')
  await session.unlinkGroup()
  assert.equal(states.at(-1).status, 'none')
})

test('late timed-out self lookup cannot replace a new authorization account', async () => {
  credentials.session = 'old-session'
  const pending = deferred()
  lookup = () => pending.promise
  const originalTimeout = globalThis.setTimeout
  const timeout = mock.method(globalThis, 'setTimeout', (fn, ms, ...args) =>
    originalTimeout(fn, ms === 20_000 ? 1 : ms, ...args),
  )
  const states = []
  const session = new TelegramSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await assert.rejects(session.restore(), /Could not restore/)
  timeout.mock.restore()
  credentials.session = null
  lookup = async () => [user]
  await session.connect(callbacks)
  pending.resolve([{ ...user, id: 999 }])
  await new Promise(resolve => setImmediate(resolve))
  const requests = []
  mock.method(BaseTelegramClient.prototype, 'call', async request => {
    requests.push(request._)
    const chat = { _: 'chat', id: 123, title: 'Team' }
    if (request._ === 'messages.checkChatInvite') return { _: 'chatInviteAlready', chat }
    if (request._ === 'messages.getChats') return { _: 'messages.chats', chats: [chat] }
    throw new Error('Unexpected RPC')
  })
  await session.connectGroup('t.me/+invite')
  assert.equal(telegramGroup.save.mock.calls[0].arguments[0].accountId, '1')
  assert.deepEqual(requests, ['messages.checkChatInvite', 'messages.getChats'])
  assert.deepEqual(states.at(-1), { group: { title: 'Team', id: '-123', hasTopics: false }, status: 'connected' })
  await session.unlinkGroup()
  assert.equal(states.at(-1).status, 'none')
  session.dispose()
})

async function restoredChat(t, start = async () => {}) {
  credentials.session = 'saved-session'
  const query = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  const chats = []
  const groups = []
  const clients = []
  mock.method(telegramGroup, 'read', async () => basic)
  mock.method(BaseTelegramClient.prototype, 'startUpdatesLoop', async function () {
    clients.push(this)
    events.push('updates-start')
    await start()
  })
  mock.method(BaseTelegramClient.prototype, 'stopUpdatesLoop', async () => {
    events.push('updates-stop')
  })
  mock.method(BaseTelegramClient.prototype, 'call', async request => {
    if (request._ === 'users.getUsers') return [user]
    if (request._ === 'messages.getChats')
      return { _: 'messages.chats', chats: [{ _: 'chat', id: 123, title: 'Team' }] }
    if (request._ === 'messages.checkChatInvite')
      return { _: 'chatInviteAlready', chat: { _: 'chat', id: 123, title: 'Team' } }
    throw new Error('Unexpected request in chat lifecycle test')
  })
  const session = new TelegramSession(
    () => {},
    () => {},
    state => groups.push(state),
    query,
    chat => chats.push(chat),
  )
  t.after(async () => {
    session.dispose()
    await new Promise(resolve => setImmediate(resolve))
    query.clear()
  })
  await session.restore()
  assert.ok(chats.at(-1)?.isReady)
  return { session, query, chats, groups, client: clients[0] }
}

test('unlink aborts chat and removes its queries before native group removal completes', async t => {
  const f = await restoredChat(t)
  const chat = f.chats.at(-1)
  f.query.setQueryData(chat.cache.keys.history(null), { pages: [], pageParams: [] })
  const pending = deferred()
  mock.method(telegramGroup, 'remove', () => pending.promise)
  const unlinking = f.session.unlinkGroup()
  assert.equal(chat.signal.aborted, true)
  assert.equal(f.chats.at(-1), null)
  assert.equal(f.query.getQueryCache().getAll().length, 0)
  pending.resolve()
  await unlinking
  assert.equal(f.groups.at(-1).status, 'none')
})

test('failed unlink keeps a retryable selection and creates a fresh chat lifetime on retry', async t => {
  const f = await restoredChat(t)
  const old = f.chats.at(-1)
  mock.method(telegramGroup, 'remove', async () => {
    throw new Error('private storage error')
  })
  await assert.rejects(f.session.unlinkGroup(), /Could not remove/)
  assert.equal(f.groups.at(-1).status, 'unavailable')
  assert.equal(f.groups.at(-1).group.id, '-123')
  assert.equal(f.chats.at(-1), null)
  assert.equal(old.signal.aborted, true)
  await f.session.retryGroup()
  assert.equal(f.groups.at(-1).status, 'connected')
  assert.ok(f.chats.at(-1).isReady)
  assert.notEqual(f.chats.at(-1).scope, old.scope)
})

test('revocation blocks a new login during native cleanup and ignores later errors from the old client', async t => {
  const f = await restoredChat(t)
  const old = f.chats.at(-1)
  f.query.setQueryData(old.cache.keys.history(null), { pages: [], pageParams: [] })
  const pending = deferred()
  remove = () => pending.promise
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(old.signal.aborted, true)
  assert.equal(f.query.getQueryCache().getAll().length, 0)
  assert.equal(auth.disconnectTelegram.mock.callCount(), 1)
  assert.equal(await f.session.connect(callbacks), false)
  pending.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(await f.session.connect(callbacks), true)
  const current = f.chats.at(-1)
  assert.ok(current.isReady)
  assert.notEqual(current.scope, old.scope)
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(current.signal.aborted, false)
  assert.equal(auth.disconnectTelegram.mock.callCount(), 1)
})

test('relink waits for old update startup cleanup before starting the replacement chat', async t => {
  const pending = deferred()
  let starts = 0
  const f = await restoredChat(t, () => (++starts === 1 ? pending.promise : Promise.resolve()))
  const old = f.chats.at(-1)
  await f.session.unlinkGroup()
  const relinking = f.session.connectGroup('t.me/+example')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.chats.at(-1), null)
  assert.equal(starts, 1)
  pending.resolve()
  await relinking
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(f.chats.at(-1).isReady)
  assert.notEqual(f.chats.at(-1).scope, old.scope)
  assert.equal(starts, 2)
  assert.equal(events.at(-1), 'updates-start')
})
