export const clockifyEntrySyncDaysOptions = [5, 15, 30] as const
export const clockifyEntrySyncIntervalOptions = ['manual', '5m', '15m', '30m', '1h'] as const

export type ClockifyEntrySyncDaysOption = (typeof clockifyEntrySyncDaysOptions)[number]
export type ClockifyEntrySyncIntervalOption = (typeof clockifyEntrySyncIntervalOptions)[number]

export const defaultClockifyEntrySyncDays: ClockifyEntrySyncDaysOption = 30
export const defaultClockifyEntrySyncInterval: ClockifyEntrySyncIntervalOption = '30m'

export function getClockifyEntrySyncDaysLabel(option: ClockifyEntrySyncDaysOption) {
  return `${option} days`
}

export function getClockifyEntrySyncIntervalLabel(option: ClockifyEntrySyncIntervalOption) {
  switch (option) {
    case 'manual':
      return 'Manual'
    case '5m':
      return 'Every 5 minutes'
    case '15m':
      return 'Every 15 minutes'
    case '30m':
      return 'Every 30 minutes'
    case '1h':
      return 'Every hour'
  }
}

export function getClockifyEntrySyncIntervalMilliseconds(option: ClockifyEntrySyncIntervalOption) {
  switch (option) {
    case 'manual':
      return false
    case '5m':
      return 5 * 60_000
    case '15m':
      return 15 * 60_000
    case '30m':
      return 30 * 60_000
    case '1h':
      return 60 * 60_000
  }
}
