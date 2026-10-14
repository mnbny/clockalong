import { BaseTelegramClient } from '@mtcute/web'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

import { auth } from '../src/services/tauri/auth-client.ts'
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
