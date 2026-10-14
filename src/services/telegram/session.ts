/* eslint-disable preserve-caught-error -- Telegram errors may contain credentials; expose only safe messages. */
import { BaseTelegramClient, MemoryStorage, tl } from '@mtcute/web'
import { getMe, logOut, signInQr } from '@mtcute/web/methods.js'
import { isTauri } from '@tauri-apps/api/core'

import { auth } from '../tauri/auth-client'

export type TelegramOperation = 'idle' | 'restoring' | 'connecting' | 'saving' | 'disconnecting'
export type TelegramLoginView = { step: 'waiting' | 'password' | 'saving' } | { step: 'qr'; url: string }
export type TelegramLoginCallbacks = {
  show: (view: TelegramLoginView) => void
  password: () => Promise<string>
  invalidPassword: () => void
}

const invalidSession = (error: unknown) =>
  tl.RpcError.is(error) &&
  [
    'AUTH_KEY_UNREGISTERED',
    'AUTH_KEY_DUPLICATED',
    'SESSION_REVOKED',
    'SESSION_EXPIRED',
    'USER_DEACTIVATED',
    'USER_DEACTIVATED_BAN',
  ].includes(error.text)

export class TelegramSession {
  private client: BaseTelegramClient | null = null
  private attempt: AbortController | null = null
  private operation: TelegramOperation = 'idle'

  constructor(
    private readonly onOperation: (operation: TelegramOperation) => void,
    private readonly onUnavailable: (reason: string) => void,
  ) {}

  private setOperation(operation: TelegramOperation) {
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
    if (!credential.apiId || !credential.apiHash) {
      this.onUnavailable('Telegram is not configured in this build. Ask the maintainer to add the Telegram app keys.')
      return null
    }
    this.client = new BaseTelegramClient({
      apiId: credential.apiId,
      apiHash: credential.apiHash,
      storage: new MemoryStorage(),
      updates: false,
      logLevel: 0,
      initConnectionOptions: { deviceModel: 'Clockalong Desktop', appVersion: '0.0.0' },
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
      await bounded(
        (async () => {
          await prepared.client.importSession(savedSession)
          await getMe(prepared.client)
        })(),
        20_000,
      )
      attempt.signal.throwIfAborted()
      const exportedSession = await prepared.client.exportSession()
      attempt.signal.throwIfAborted()
      this.setOperation('saving')
      await auth.connectTelegram(exportedSession)
      committed = true
    } catch (error) {
      if (!attempt.signal.aborted) {
        if (invalidSession(error)) {
          await auth.disconnectTelegram()
          throw new Error('Your Telegram session expired. Connect again to scan a new QR code.')
        }
        await auth.setTelegramUnavailable()
        throw new Error('Could not restore Telegram. Your saved session is kept; try connecting again.')
      }
    } finally {
      if (!committed) await this.destroyClient()
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
          await bounded(
            (async () => {
              await client.importSession(session)
              await getMe(client)
            })(),
            20_000,
          )
        } catch (error) {
          attempt.signal.throwIfAborted()
          if (invalidSession(error)) {
            await auth.disconnectTelegram()
            throw new Error('Your Telegram session expired. Try again to scan a new QR code.')
          }
          throw error
        }
      } else {
        await signInQr(client, {
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
    if (this.operation !== 'idle') return false
    this.setOperation('disconnecting')
    try {
      await auth.disconnectTelegram().catch(() => {
        throw new Error('Could not remove the saved Telegram session. Try Disconnect again.')
      })
      return await this.logoutClient()
    } finally {
      await this.destroyClient()
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
    const client = this.client
    this.client = null
    await client?.destroy().catch(() => {})
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
