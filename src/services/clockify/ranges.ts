import type { UserSettingsDtoV1 } from './generated/clockify'

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

export type ClockifyPeriod = 'today' | 'week' | 'month'
const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

export function getClockifyPeriodRange(
  period: ClockifyPeriod,
  now: Date,
  timeZone?: string,
  weekStart: UserSettingsDtoV1['weekStart'] = 'MONDAY',
) {
  const current = timeZone ? dayjs(now).tz(timeZone) : dayjs(now)
  const start =
    period === 'month'
      ? current.startOf('month')
      : period === 'week'
        ? current.subtract((current.day() - weekdays.indexOf(weekStart) + 7) % 7, 'day').startOf('day')
        : current.startOf('day')
  const end =
    period === 'month'
      ? start.add(1, 'month').startOf('month')
      : start.add(period === 'week' ? 7 : 1, 'day').startOf('day')
  return { start: start.toDate(), end: end.toDate() }
}

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
