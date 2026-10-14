/* eslint-disable preserve-caught-error -- Telegram errors may contain credentials; expose only safe messages. */
import type { QueryClient } from '@tanstack/react-query'

import { BaseTelegramClient, MemoryStorage, tl } from '@mtcute/web'
import { getMe, logOut, signInQr } from '@mtcute/web/methods.js'
import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../tauri/auth-client'
import { telegramGroup } from '../tauri/telegram-group-client'
import { TelegramChat } from './chat'
import { invalidTelegramSession } from './errors'
import {
  groupError,
  groupIdentity,
  resolveGroup,
  type SavedTelegramGroup,
  TelegramGroupError,
  type TelegramGroupState,
  verifyGroup,
} from './group'

export type TelegramOperation = 'idle' | 'restoring' | 'connecting' | 'saving' | 'disconnecting' | 'group'
export type TelegramLoginView = { step: 'waiting' | 'password' | 'saving' } | { step: 'qr'; url: string }
export type TelegramLoginCallbacks = {
  show: (view: TelegramLoginView) => void
  password: () => Promise<string>
  invalidPassword: () => void
}

export class TelegramSession {
  private client: BaseTelegramClient | null = null
  private attempt: AbortController | null = null
  private accountId: string | null = null
  private savedGroup: SavedTelegramGroup | null = null
  private operation: TelegramOperation = 'idle'
  private chat: TelegramChat | null = null
  private chatEpoch = 0
  private chatTeardown = Promise.resolve()
  private revoking = false
  private operationSettled: (() => void) | null = null

  constructor(
    private readonly onOperation: (operation: TelegramOperation) => void,
    private readonly onUnavailable: (reason: string) => void,
    private readonly onGroup: (state: TelegramGroupState) => void = () => {},
    private readonly query?: QueryClient,
    private readonly onChat: (chat: TelegramChat | null) => void = () => {},
  ) {}

  private setOperation(operation: TelegramOperation) {
    if (operation === 'idle') {
      this.operationSettled?.()
      this.operationSettled = null
      if (this.revoking) operation = 'disconnecting'
    }
    this.operation = operation
    this.onOperation(operation)
  }

  private async prepare() {
    if (!isTauri()) {
      this.onUnavailable('Telegram login requires the Clockalong desktop app.')
      return null
    }
    const credential = await auth.getTelegramCredential().catch(() => {
      throw new Error('Could not read the saved Telegram session. Try again.')
    })
    if (credential.session) await this.loadGroup()
    else await this.clearGroup()
    if (!credential.apiId || !credential.apiHash) {
      this.onUnavailable('Telegram is not configured in this build. Ask the maintainer to add the Telegram app keys.')
      return null
    }
    this.client = new BaseTelegramClient({
      apiId: credential.apiId,
      apiHash: credential.apiHash,
      storage: new MemoryStorage(),
      updates: { catchUp: false, onChannelTooLong: id => this.chat?.channelGap(id) },
      logLevel: 0,
      initConnectionOptions: { deviceModel: 'Clockalong Desktop', appVersion: '0.0.0' },
    })
    const client = this.client
    client.onError.add(error => {
      if (invalidTelegramSession(error) && this.client === client) void this.sessionRevoked(client)
    })
    return { client: this.client, session: credential.session }
  }

  async restore() {
    if (this.operation !== 'idle') return
    this.setOperation('restoring')
    const attempt = (this.attempt = new AbortController())
    let committed = false
    try {
      const prepared = await this.prepare()
      attempt.signal.throwIfAborted()
      if (!prepared?.session) {
        await this.destroyClient()
        return
      }
      const savedSession = prepared.session
      const me = await bounded(
        (async () => {
          await prepared.client.importSession(savedSession)
          return getMe(prepared.client)
        })(),
        20_000,
      )
      attempt.signal.throwIfAborted()
      this.accountId = String(me.id)
      const exportedSession = await prepared.client.exportSession()
      attempt.signal.throwIfAborted()
      this.setOperation('saving')
      await auth.connectTelegram(exportedSession)
      committed = true
    } catch (error) {
      if (!attempt.signal.aborted) {
        if (invalidTelegramSession(error)) {
          await auth.disconnectTelegram()
          this.resetGroup()
          throw new Error('Your Telegram session expired. Connect again to scan a new QR code.')
        }
        await auth.setTelegramUnavailable()
        throw new Error('Could not restore Telegram. Your saved session is kept; try connecting again.')
      }
    } finally {
      if (!committed) await this.destroyClient()
      else if (!attempt.signal.aborted) await this.restoreGroup(attempt)
      this.attempt = null
      this.setOperation('idle')
    }
  }

  async connect(callbacks: TelegramLoginCallbacks) {
    if (this.operation !== 'idle') return false
    this.setOperation('connecting')
    const attempt = (this.attempt = new AbortController())
    let authorized = false
    let committed = false
    let restoring = false
    let saving = false
    try {
      await this.destroyClient()
      const prepared = await this.prepare()
      attempt.signal.throwIfAborted()
      if (!prepared) return false
      const { client, session } = prepared
      if (session) {
        restoring = true
        try {
          const me = await bounded(
            (async () => {
              await client.importSession(session)
              return getMe(client)
            })(),
            20_000,
          )
          attempt.signal.throwIfAborted()
          this.accountId = String(me.id)
        } catch (error) {
          attempt.signal.throwIfAborted()
          if (invalidTelegramSession(error)) {
            await auth.disconnectTelegram()
            this.resetGroup()
            throw new Error('Your Telegram session expired. Try again to scan a new QR code.')
          }
          throw error
        }
      } else {
        attempt.signal.throwIfAborted()
        const me = await signInQr(client, {
          abortSignal: attempt.signal,
          onUrlUpdated: url => {
            if (!attempt.signal.aborted) callbacks.show({ step: 'qr', url })
          },
          onQrScanned: () => {
            if (!attempt.signal.aborted) callbacks.show({ step: 'waiting' })
          },
          password: () => {
            attempt.signal.throwIfAborted()
            return callbacks.password()
          },
          invalidPasswordCallback: callbacks.invalidPassword,
        })
        attempt.signal.throwIfAborted()
        this.accountId = String(me.id)
      }
      authorized = true
      attempt.signal.throwIfAborted()
      const exportedSession = await client.exportSession()
      attempt.signal.throwIfAborted()
      this.setOperation('saving')
      saving = true
      callbacks.show({ step: 'saving' })
      await auth.connectTelegram(exportedSession)
      committed = true
      return true
    } catch (error) {
      if (authorized && !restoring && this.client) await this.logoutClient()
      if (attempt.signal.aborted) return false
      await auth.setTelegramUnavailable().catch(() => {})
      if (saving) throw new Error('Could not save Telegram securely. Try connecting again.')
      if (tl.RpcError.is(error, 'API_ID_INVALID') || tl.RpcError.is(error, 'API_ID_PUBLISHED_FLOOD'))
        throw new Error('The Telegram app keys were rejected. Contact the maintainer.')
      if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) throw new Error('Telegram asked you to wait before trying again.')
      throw new Error(
        restoring
          ? 'Could not restore Telegram. Try again, or Disconnect to remove the saved session.'
          : 'Could not connect Telegram. Check your connection and try again.',
      )
    } finally {
      if (!committed) await this.destroyClient()
      else if (!attempt.signal.aborted) await this.restoreGroup(attempt)
      this.attempt = null
      this.setOperation('idle')
    }
  }

  cancel() {
    if (this.operation === 'saving' || this.operation === 'disconnecting') return false
    if (this.operation === 'connecting' || this.operation === 'restoring') {
      this.attempt?.abort()
      void this.destroyClient()
    }
    return true
  }

  async disconnect() {
    if (this.operation !== 'idle') throw new Error('Wait for the current Telegram action to finish.')
    this.setOperation('disconnecting')
    this.stopChat()
    try {
      await auth.disconnectTelegram().catch(() => {
        throw new Error('Could not remove the saved Telegram session. Try Disconnect again.')
      })
      this.resetGroup()
      return await this.logoutClient()
    } finally {
      await this.destroyClient()
      this.setOperation('idle')
    }
  }

  private resetGroup() {
    this.stopChat()
    this.savedGroup = null
    this.onGroup({ group: null, status: 'none' })
  }

  private async clearGroup() {
    await telegramGroup.remove().catch(() => {
      throw new Error('Could not remove the saved Telegram group. Try again.')
    })
    this.resetGroup()
  }

  private async loadGroup() {
    try {
      this.savedGroup = await telegramGroup.read()
      this.onGroup(
        this.savedGroup
          ? {
              group: groupIdentity(this.savedGroup),
              status: 'unavailable',
              error: 'Connect Telegram to verify this group.',
            }
          : { group: null, status: 'none' },
      )
    } catch {
      this.onGroup({ group: null, status: 'unavailable', error: 'Could not read the saved group. Retry or unlink it.' })
    }
  }

  private async restoreGroup(attempt: AbortController) {
    this.stopChat()
    try {
      const saved = await telegramGroup.read()
      attempt.signal.throwIfAborted()
      this.savedGroup = saved
      if (!saved) {
        this.resetGroup()
        return
      }
      if (!this.client || !this.accountId) throw new TelegramGroupError('Connect Telegram before connecting a group.')
      const verified = await bounded(verifyGroup(this.client, saved, this.accountId), 20_000)
      attempt.signal.throwIfAborted()
      await this.saveGroup(verified, attempt)
    } catch (error) {
      if (!attempt.signal.aborted)
        this.onGroup({
          group: this.savedGroup ? groupIdentity(this.savedGroup) : null,
          status: 'unavailable',
          error: groupError(error),
        })
    }
  }

  private async saveGroup(group: SavedTelegramGroup, attempt: AbortController) {
    this.setOperation('saving')
    await telegramGroup.save(group).catch(() => {
      throw new TelegramGroupError('Could not save the group securely. Try again.')
    })
    attempt.signal.throwIfAborted()
    this.savedGroup = group
    this.onGroup({ group: groupIdentity(group), status: 'connected' })
    await this.startChat(group)
  }

  async connectGroup(link: string) {
    if (this.operation !== 'idle' || !this.client || !this.accountId)
      throw new Error('Wait until Telegram is connected and ready.')
    if (this.savedGroup) throw new Error('Unlink the current group before connecting another.')
    this.setOperation('group')
    const attempt = (this.attempt = new AbortController())
    try {
      const group = await bounded(resolveGroup(this.client, link, this.accountId), 20_000)
      attempt.signal.throwIfAborted()
      await this.saveGroup(group, attempt)
    } catch (error) {
      throw new Error(groupError(error))
    } finally {
      this.attempt = null
      this.setOperation('idle')
    }
  }

  async retryGroup() {
    if (this.operation !== 'idle' || !this.client || !this.accountId)
      throw new Error('Wait until Telegram is connected and ready.')
    this.setOperation('group')
    const attempt = (this.attempt = new AbortController())
    try {
      await this.restoreGroup(attempt)
    } finally {
      this.attempt = null
      this.setOperation('idle')
    }
  }

  async unlinkGroup() {
    if (this.operation !== 'idle') throw new Error('Wait for the current Telegram action to finish.')
    this.setOperation('group')
    this.stopChat()
    try {
      await this.clearGroup()
    } catch (error) {
      this.onGroup({
        group: this.savedGroup ? groupIdentity(this.savedGroup) : null,
        status: 'unavailable',
        error: 'Could not unlink the group. Retry its connection or unlink again.',
      })
      throw error
    } finally {
      this.setOperation('idle')
    }
  }

  private async logoutClient() {
    if (!this.client) return false
    try {
      await bounded(logOut(this.client), 4_000)
      return true
    } catch {
      return false
    }
  }

  private async destroyClient() {
    this.stopChat()
    const client = this.client
    this.client = null
    this.accountId = null
    await client?.destroy().catch(() => {})
  }

  private stopChat() {
    ++this.chatEpoch
    const chat = this.chat
    this.chat = null
    this.onChat(null)
    if (chat) this.chatTeardown = chat.dispose().catch(() => {})
    else {
      const client = this.client
      const epoch = this.chatEpoch
      this.chatTeardown = this.chatTeardown.then(async () => {
        if (client && epoch === this.chatEpoch && !this.chat) await client.stopUpdatesLoop().catch(() => {})
      })
    }
  }

  private async startChat(group: SavedTelegramGroup) {
    if (!this.query || !this.client) return
    const epoch = this.chatEpoch
    const client = this.client
    await this.chatTeardown
    if (epoch !== this.chatEpoch || this.client !== client) return
    const chat = new TelegramChat(
      client,
      group,
      this.query,
      () => {
        this.onChat(this.chat)
        if (this.chat && !this.chat.isReady)
          this.onGroup({
            group: groupIdentity(group),
            status: 'unavailable',
            error: 'This group is unavailable. Retry its connection or unlink it.',
          })
      },
      () => this.sessionRevoked(client),
    )
    this.chat = chat
    this.onChat(chat)
    void chat.start()
  }

  private async sessionRevoked(client: BaseTelegramClient) {
    if (this.client !== client || this.revoking) return
    this.revoking = true
    const settled =
      this.operation === 'idle'
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            this.operationSettled = resolve
          })
    this.attempt?.abort()
    this.stopChat()
    if (this.operation === 'idle') this.setOperation('disconnecting')
    try {
      await settled
      if (this.client !== client) return
      await auth.disconnectTelegram().catch(async () => {
        await auth.setTelegramUnavailable().catch(() => {})
      })
      if (this.client !== client) return
      this.resetGroup()
      await this.destroyClient()
    } finally {
      this.revoking = false
      this.setOperation('idle')
    }
  }

  dispose() {
    this.attempt?.abort()
    void this.destroyClient()
  }
}

async function bounded<T>(promise: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
