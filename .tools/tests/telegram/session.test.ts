import type { ClockalongTelegramCredentialSnapshot } from '../../../src/services/tauri/auth-client'
import type { TelegramChat } from '../../../src/services/telegram/chat'
import type { SavedTelegramGroup, TelegramGroupState } from '../../../src/services/telegram/group'

import { BaseTelegramClient, tl } from '@mtcute/web'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, onTestFinished, test, vi } from 'vitest'

import { auth } from '../../../src/services/tauri/auth-client'
import { telegramGroup } from '../../../src/services/tauri/telegram-group-client'
import { TelegramSession } from '../../../src/services/telegram/session'
import { deferred } from './fixtures'

const user: tl.RawUser = { _: 'user', id: 1, firstName: 'Test', self: true }
const callbacks = { show() {}, password: async () => '', invalidPassword() {} }
let saved: boolean
let events: string[]
let credentials: ClockalongTelegramCredentialSnapshot
let login: () => Promise<tl.auth.TypeLoginToken>
let save: () => Promise<void>
let remove: () => Promise<void>
let lookup: () => Promise<tl.TypeUser[]>
const sessions: TelegramSession[] = []
const rawChat: tl.RawChat = {
  _: 'chat',
  id: 123,
  title: 'Team',
  photo: { _: 'chatPhotoEmpty' },
  participantsCount: 2,
  date: 0,
  version: 1,
}
const authorized: tl.auth.RawLoginTokenSuccess = {
  _: 'auth.loginTokenSuccess',
  authorization: { _: 'auth.authorization', user },
}

function createSession(...args: ConstructorParameters<typeof TelegramSession>) {
  const session = new TelegramSession(...args)
  sessions.push(session)
  return session
}

afterEach(async () => {
  for (const session of sessions.splice(0)) session.dispose()
  await new Promise(resolve => setImmediate(resolve))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.stubGlobal('isTauri', true)
  saved = false
  events = []
  credentials = { apiId: 1, apiHash: 'test-app-hash', session: null }
  login = async () => authorized
  lookup = async () => [user]
  save = async () => {
    events.push('save')
    saved = true
  }
  remove = async () => {
    events.push('delete')
    saved = false
  }
  vi.spyOn(telegramGroup, 'read').mockImplementation(async () => null)
  vi.spyOn(telegramGroup, 'save').mockImplementation(async () => {})
  vi.spyOn(telegramGroup, 'remove').mockImplementation(async () => {})
  vi.spyOn(auth, 'getTelegramCredential').mockImplementation(async () => credentials)
  vi.spyOn(auth, 'connectTelegram').mockImplementation(() => save())
  vi.spyOn(auth, 'disconnectTelegram').mockImplementation(() => remove())
  vi.spyOn(auth, 'setTelegramUnavailable').mockImplementation(async () => {
    events.push('unavailable')
  })
  vi.spyOn(BaseTelegramClient.prototype, 'getApiCredentials').mockImplementation(async () => ({
    id: 1,
    hash: 'test-app-hash',
  }))
  vi.spyOn(BaseTelegramClient.prototype, 'importSession').mockImplementation(async () => {})
  vi.spyOn(BaseTelegramClient.prototype, 'exportSession').mockImplementation(async () => 'test-session')
  vi.spyOn(BaseTelegramClient.prototype, 'notifyLoggedIn').mockImplementation(async () => user)
  vi.spyOn(BaseTelegramClient.prototype, 'notifyLoggedOut').mockImplementation(async () => {})
  vi.spyOn(BaseTelegramClient.prototype, 'destroy').mockImplementation(async () => {
    events.push('destroy')
  })
  vi.spyOn(BaseTelegramClient.prototype, 'call').mockImplementation(async function (request) {
    if (request._ === 'auth.exportLoginToken') return login()
    if (request._ === 'users.getUsers') return lookup()
    if (request._ === 'auth.logOut') {
      events.push('logout')
      return { _: 'auth.loggedOut' }
    }
    throw new Error('Unexpected request in login-only test')
  })
})

test('late QR completion after cancel never saves authorization', async () => {
  const pending = deferred<tl.auth.TypeLoginToken>()
  login = () => pending.promise
  const session = createSession(
    () => {},
    () => {},
  )
  const connected = session.connect(callbacks)
  await new Promise(resolve => setImmediate(resolve))
  session.cancel()
  pending.resolve(authorized)
  expect(await connected).toBe(false)
  expect(saved).toBe(false)
  expect(events.includes('destroy')).toBeTruthy()
})

test('native save finishes before success and cannot be cancelled', async () => {
  const pending = deferred()
  save = async () => {
    events.push('save')
    await pending.promise
    saved = true
  }
  const session = createSession(
    () => {},
    () => {},
  )
  const connected = session.connect(callbacks)
  await new Promise(resolve => setImmediate(resolve))
  expect(session.cancel()).toBe(false)
  expect(saved).toBe(false)
  pending.resolve()
  expect(await connected).toBe(true)
  expect(saved).toBe(true)
  expect(session.cancel()).toBe(true)
  expect(!events.includes('destroy'), 'closing a committed dialog keeps the connection').toBeTruthy()
  session.dispose()
})

test('failed save attempts remote logout, destroys client, and exposes no raw error', async () => {
  save = async () => {
    throw new Error('secret protocol payload')
  }
  const session = createSession(
    () => {},
    () => {},
  )
  await expect(session.connect(callbacks)).rejects.toMatchObject({
    message: 'Could not save Telegram securely. Try connecting again.',
  })
  expect(events.includes('logout')).toBeTruthy()
  expect(events.includes('destroy')).toBeTruthy()
  expect(saved).toBe(false)
})

test('disconnect deletes locally before remote logout', async () => {
  const session = createSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  await session.disconnect()
  expect(events.indexOf('delete') < events.indexOf('logout')).toBeTruthy()
  expect(saved).toBe(false)
})

test('failed local deletion reports failure without remote logout', async () => {
  const session = createSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  remove = async () => {
    throw new Error('disk unavailable')
  }
  await expect(session.disconnect()).rejects.toThrow(/Could not remove/)
  expect(saved).toBe(true)
  expect(!events.includes('logout')).toBeTruthy()
  expect(events.includes('destroy')).toBeTruthy()
})

test('restore network failure retains the stored session and clears public availability', async () => {
  credentials.session = 'saved-test-session'
  lookup = async () => {
    throw new Error('network unavailable')
  }
  const session = createSession(
    () => {},
    () => {},
  )
  await expect(session.restore()).rejects.toThrow(/saved session is kept/)
  expect(events.includes('unavailable')).toBeTruthy()
  expect(!events.includes('delete')).toBeTruthy()
  expect(events.includes('destroy')).toBeTruthy()
})

test('revoked sessions are deleted rather than retried indefinitely', async () => {
  credentials.session = 'revoked-test-session'
  lookup = async () => {
    throw new tl.RpcError(401, 'SESSION_REVOKED')
  }
  const session = createSession(
    () => {},
    () => {},
  )
  await expect(session.restore()).rejects.toThrow(/session expired/)
  expect(events.includes('delete')).toBeTruthy()
  expect(events.includes('destroy')).toBeTruthy()
})

test('missing app configuration creates no client or protocol request', async () => {
  credentials.apiId = null
  let reason: string | null = null
  const session = createSession(
    () => {},
    value => {
      reason = value
    },
  )
  await session.restore()
  expect(reason).toMatch(/not configured/)
  expect(BaseTelegramClient.prototype.call).toHaveBeenCalledTimes(0)
})

const basic: SavedTelegramGroup = { version: 1, accountId: '1', kind: 'basic', id: '123', title: 'Team' }

test('group restore failure preserves authenticated account and saved group for retry', async () => {
  credentials.session = 'saved-session'
  vi.spyOn(telegramGroup, 'read').mockImplementation(async () => basic)
  const states: TelegramGroupState[] = []
  const session = createSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await session.restore()
  expect(saved).toBe(true)
  expect(!events.includes('unavailable')).toBeTruthy()
  expect(states.slice(-1)[0].status).toBe('unavailable')
  expect(telegramGroup.remove).toHaveBeenCalledTimes(0)
  session.dispose()
})

test('fresh QR authorization removes old group first; failed removal prevents login', async () => {
  vi.spyOn(telegramGroup, 'remove').mockImplementation(async () => {
    throw new Error('private storage error')
  })
  const session = createSession(
    () => {},
    () => {},
  )
  await expect(session.connect(callbacks)).rejects.toThrow(/Could not connect/)
  expect(BaseTelegramClient.prototype.call).toHaveBeenCalledTimes(0)
})

test('no saved session discards an orphan group', async () => {
  const session = createSession(
    () => {},
    () => {},
  )
  await session.restore()
  expect(telegramGroup.remove).toHaveBeenCalledTimes(1)
})

test('failed unlink does not clear the selection or claim success', async () => {
  const states: TelegramGroupState[] = []
  const session = createSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  vi.spyOn(telegramGroup, 'remove').mockImplementation(async () => {
    throw new Error('private storage error')
  })
  await expect(session.unlinkGroup()).rejects.toThrow(/Could not remove/)
  expect(states.slice(-1)[0].status).toBe('unavailable')
  expect(states.slice(-1)[0].group).toBe(null)
})

test('pending group verification cannot race unlink or disconnect and disposed results never save', async () => {
  const pending = deferred<tl.messages.TypeChats>()
  const session = createSession(
    () => {},
    () => {},
  )
  await session.connect(callbacks)
  vi.spyOn(BaseTelegramClient.prototype, 'call').mockImplementation(async request => {
    if (request._ === 'messages.checkChatInvite') return { _: 'chatInviteAlready', chat: rawChat }
    expect(request._).toBe('messages.getChats')
    return pending.promise
  })
  const connecting = session.connectGroup('https://t.me/+example')
  await expect(session.unlinkGroup()).rejects.toThrow(/Wait/)
  await expect(session.disconnect()).rejects.toThrow(/Wait/)
  session.dispose()
  pending.resolve({ _: 'messages.chats', chats: [rawChat] })
  await expect(connecting).rejects.toThrow()
  expect(telegramGroup.save).toHaveBeenCalledTimes(0)
})

test('offline startup keeps safe group identity and permits local unlink', async () => {
  credentials.session = 'saved-session'
  vi.spyOn(telegramGroup, 'read').mockImplementation(async () => basic)
  lookup = async () => {
    throw new Error('offline')
  }
  const states: TelegramGroupState[] = []
  const session = createSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await expect(session.restore()).rejects.toThrow()
  expect(states.slice(-1)[0].group!.title).toBe('Team')
  expect(states.slice(-1)[0].status).toBe('unavailable')
  await session.unlinkGroup()
  expect(states.slice(-1)[0].status).toBe('none')
})

test('late timed-out self lookup cannot replace a new authorization account', async () => {
  credentials.session = 'old-session'
  const pending = deferred<tl.TypeUser[]>()
  lookup = () => pending.promise
  const originalTimeout = globalThis.setTimeout
  const timeout = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation((fn, ms, ...args) => originalTimeout(fn, ms === 20_000 ? 1 : ms, ...args))
  const states: TelegramGroupState[] = []
  const session = createSession(
    () => {},
    () => {},
    state => states.push(state),
  )
  await expect(session.restore()).rejects.toThrow(/Could not restore/)
  timeout.mockRestore()
  credentials.session = null
  lookup = async () => [user]
  await session.connect(callbacks)
  pending.resolve([{ ...user, id: 999 }])
  await new Promise(resolve => setImmediate(resolve))
  const requests: string[] = []
  vi.spyOn(BaseTelegramClient.prototype, 'call').mockImplementation(async request => {
    requests.push(request._)
    const chat = rawChat
    if (request._ === 'messages.checkChatInvite') return { _: 'chatInviteAlready', chat }
    if (request._ === 'messages.getChats') return { _: 'messages.chats', chats: [chat] }
    throw new Error('Unexpected RPC')
  })
  await session.connectGroup('t.me/+invite')
  expect(vi.mocked(telegramGroup.save).mock.calls[0][0].accountId).toBe('1')
  expect(requests).toStrictEqual(['messages.checkChatInvite', 'messages.getChats'])
  expect(states.slice(-1)[0]).toStrictEqual({
    group: { title: 'Team', id: '-123', hasTopics: false },
    status: 'connected',
  })
  await session.unlinkGroup()
  expect(states.slice(-1)[0].status).toBe('none')
  session.dispose()
})

async function restoredChat(start = async () => {}) {
  credentials.session = 'saved-session'
  const query = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } })
  const chats: (TelegramChat | null)[] = []
  const groups: TelegramGroupState[] = []
  const clients: BaseTelegramClient[] = []
  vi.spyOn(telegramGroup, 'read').mockImplementation(async () => basic)
  vi.spyOn(BaseTelegramClient.prototype, 'startUpdatesLoop').mockImplementation(async function (
    this: BaseTelegramClient,
  ) {
    clients.push(this)
    events.push('updates-start')
    await start()
  })
  vi.spyOn(BaseTelegramClient.prototype, 'stopUpdatesLoop').mockImplementation(async () => {
    events.push('updates-stop')
  })
  vi.spyOn(BaseTelegramClient.prototype, 'call').mockImplementation(async request => {
    if (request._ === 'users.getUsers') return [user]
    if (request._ === 'messages.getChats') return { _: 'messages.chats', chats: [rawChat] }
    if (request._ === 'messages.checkChatInvite') return { _: 'chatInviteAlready', chat: rawChat }
    throw new Error('Unexpected request in chat lifecycle test')
  })
  const session = createSession(
    () => {},
    () => {},
    state => groups.push(state),
    query,
    chat => chats.push(chat),
  )
  onTestFinished(() => query.clear())
  await session.restore()
  expect(chats.slice(-1)[0]?.isReady).toBeTruthy()
  return { session, query, chats, groups, client: clients[0] }
}

test('unlink aborts chat and removes its queries before native group removal completes', async () => {
  const f = await restoredChat()
  const chat = f.chats.slice(-1)[0]!
  f.query.setQueryData(chat.cache.keys.history(null), { pages: [], pageParams: [] })
  const pending = deferred()
  vi.spyOn(telegramGroup, 'remove').mockImplementation(() => pending.promise)
  const unlinking = f.session.unlinkGroup()
  expect(chat.signal.aborted).toBe(true)
  expect(f.chats.slice(-1)[0]).toBe(null)
  expect(f.query.getQueryCache().getAll().length).toBe(0)
  pending.resolve()
  await unlinking
  expect(f.groups.slice(-1)[0].status).toBe('none')
})

test('failed unlink keeps a retryable selection and creates a fresh chat lifetime on retry', async () => {
  const f = await restoredChat()
  const old = f.chats.slice(-1)[0]!
  vi.spyOn(telegramGroup, 'remove').mockImplementation(async () => {
    throw new Error('private storage error')
  })
  await expect(f.session.unlinkGroup()).rejects.toThrow(/Could not remove/)
  expect(f.groups.slice(-1)[0].status).toBe('unavailable')
  expect(f.groups.slice(-1)[0].group!.id).toBe('-123')
  expect(f.chats.slice(-1)[0]).toBe(null)
  expect(old.signal.aborted).toBe(true)
  await f.session.retryGroup()
  expect(f.groups.slice(-1)[0].status).toBe('connected')
  expect(f.chats.slice(-1)[0]!.isReady).toBeTruthy()
  expect(f.chats.slice(-1)[0]!.scope).not.toBe(old.scope)
})

test('revocation blocks a new login during native cleanup and ignores later errors from the old client', async () => {
  const f = await restoredChat()
  const old = f.chats.slice(-1)[0]!
  f.query.setQueryData(old.cache.keys.history(null), { pages: [], pageParams: [] })
  const pending = deferred()
  remove = () => pending.promise
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  await new Promise(resolve => setImmediate(resolve))
  expect(old.signal.aborted).toBe(true)
  expect(f.query.getQueryCache().getAll().length).toBe(0)
  expect(auth.disconnectTelegram).toHaveBeenCalledTimes(1)
  expect(await f.session.connect(callbacks)).toBe(false)
  pending.resolve()
  await new Promise(resolve => setImmediate(resolve))
  expect(await f.session.connect(callbacks)).toBe(true)
  const current = f.chats.slice(-1)[0]!
  expect(current.isReady).toBeTruthy()
  expect(current.scope).not.toBe(old.scope)
  f.client.onError.emit(new tl.RpcError(401, 'SESSION_REVOKED'))
  await new Promise(resolve => setImmediate(resolve))
  expect(current.signal.aborted).toBe(false)
  expect(auth.disconnectTelegram).toHaveBeenCalledTimes(1)
})

test('relink waits for old update startup cleanup before starting the replacement chat', async () => {
  const pending = deferred()
  let starts = 0
  const f = await restoredChat(() => (++starts === 1 ? pending.promise : Promise.resolve()))
  const old = f.chats.slice(-1)[0]!
  await f.session.unlinkGroup()
  const relinking = f.session.connectGroup('t.me/+example')
  await new Promise(resolve => setImmediate(resolve))
  expect(f.chats.slice(-1)[0]).toBe(null)
  expect(starts).toBe(1)
  pending.resolve()
  await relinking
  await new Promise(resolve => setImmediate(resolve))
  expect(f.chats.slice(-1)[0]!.isReady).toBeTruthy()
  expect(f.chats.slice(-1)[0]!.scope).not.toBe(old.scope)
  expect(starts).toBe(2)
  expect(events.slice(-1)[0]).toBe('updates-start')
})
