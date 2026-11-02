export function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getClockifyPeriodRange(period: 'today' | 'week' | 'month', now: Date) {
  const todayStart = getDayStart(now)
  const start = new Date(todayStart)
  const end = new Date(todayStart)

  switch (period) {
    case 'month':
      start.setDate(start.getDate() - 27)
      end.setDate(end.getDate() - 6)
      break
    case 'today':
      end.setDate(end.getDate() + 1)
      break
    case 'week':
      start.setDate(start.getDate() - 6)
      break
  }

  return { end, start }
}

export function getClockifyEntryTableRange(days: 1 | 3 | 7, now: Date) {
  const start = getDayStart(now)
  const end = getDayStart(now)

  start.setDate(start.getDate() - (days - 1))
  end.setDate(end.getDate() + 1)

  return { end, start }
}
