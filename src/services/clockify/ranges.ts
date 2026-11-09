import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

export function getDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getClockifyMonthRange(now: Date, timeZone?: string) {
  const current = timeZone ? dayjs(now).tz(timeZone) : dayjs(now)
  return { start: current.startOf('month').toDate(), end: now }
}

export function formatClockifyEntryFilterDate(date: Date, timeZone?: string) {
  const local = timeZone ? dayjs(date).tz(timeZone) : dayjs(date)
  // Clockify's entry-list filters use profile-local time despite requiring a literal Z suffix.
  return local.format('YYYY-MM-DDTHH:mm:ss.SSS[Z]')
}

export function getClockifyEntryTableRange(days: 1 | 3 | 7, now: Date) {
  const start = getDayStart(now)
  const end = getDayStart(now)

  start.setDate(start.getDate() - (days - 1))
  end.setDate(end.getDate() + 1)

  return { end, start }
}
