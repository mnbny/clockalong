import { tl } from '@mtcute/web'

export function invalidTelegramSession(error: unknown) {
  return (
    tl.RpcError.is(error) &&
    [
      'AUTH_KEY_UNREGISTERED',
      'AUTH_KEY_DUPLICATED',
      'SESSION_REVOKED',
      'SESSION_EXPIRED',
      'USER_DEACTIVATED',
      'USER_DEACTIVATED_BAN',
    ].includes(error.text)
  )
}
