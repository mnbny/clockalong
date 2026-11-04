import { useEffect, useState } from 'react'

import { useStorage } from '../services/storage/useStorage'

export function useTelegramNotificationSnooze() {
  // Keep the feed hidden until its saved deadline has loaded.
  const [until, setUntil] = useStorage('telegramNotificationsSnoozedUntil', Number.POSITIVE_INFINITY)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      clearTimeout(timer)
      const current = Date.now()
      setNow(current)
      if (Number.isFinite(until) && until > current) timer = setTimeout(check, Math.min(until - current, 2_147_483_647))
    }
    check()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [until])

  return {
    visible: until <= now,
    snooze: () => setUntil(Date.now() + 15 * 60 * 1000),
  }
}
