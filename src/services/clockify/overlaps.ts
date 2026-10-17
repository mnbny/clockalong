import type { TimeEntryWithRatesDtoV1 } from './generated/clockify'

import axios from 'axios'

import { clockify } from './client'
import { getClockifyTimeEntryUpdateBody } from './time-entries'

type CompletedTimeEntryRange = {
  end: number
  entry: TimeEntryWithRatesDtoV1
  start: number
}

export type ClockifyTimeEntryOverlapFix = {
  end: Date
  entry: TimeEntryWithRatesDtoV1
  start: Date
}

export async function fixClockifyTimeEntryOverlaps(fixes: ClockifyTimeEntryOverlapFix[]) {
  if (!fixes.length) return 0

  const { userId, workspaceId } = fixes[0].entry
  if (!userId || !workspaceId) throw new Error('Clockify entry is missing its user or workspace.')

  const updates = fixes.map(fix => {
    if (!fix.entry.id || fix.entry.userId !== userId || fix.entry.workspaceId !== workspaceId) {
      throw new Error('Clockify overlap repairs require entry IDs from the same user and workspace.')
    }
    return { ...getClockifyTimeEntryUpdateBody(fix.entry, fix.start, fix.end), id: fix.entry.id }
  })

  // shortcut: bulk size is undocumented; cap at 25 until a larger batch is verified.
  const batchSize = 25
  for (let offset = 0; offset < updates.length; offset += batchSize) {
    const body = updates.slice(offset, offset + batchSize)

    for (let attempt = 0; ; attempt += 1) {
      try {
        const entries = await clockify.replaceMany(body, { params: { userId, workspaceId } })
        const updatedIds = new Set(entries.map(entry => entry.id))
        if (body.some(entry => !updatedIds.has(entry.id))) {
          throw new Error('Clockify did not confirm every update. Refresh and review the remaining overlaps.')
        }
        break
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 429) throw error

        const retryAfter = error.response.headers['retry-after']
        const retryAfterMs =
          typeof retryAfter === 'string' && /^\d+$/.test(retryAfter.trim())
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - Date.now()
        const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(retryAfterMs) ? retryAfterMs : 0)

        if (attempt >= 3 || delay > 30_000) {
          error.message = 'Clockify is limiting requests. Try fixing the remaining overlaps again later.'
          throw error
        }

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  return fixes.length
}

export function hasCompletedClockifyTimeEntryOverlap(entries: TimeEntryWithRatesDtoV1[]) {
  const ranges = entries
    .map(getCompletedTimeEntryRange)
    .filter((range): range is CompletedTimeEntryRange => Boolean(range))
    .sort((left, right) => left.start - right.start)

  let latestEnd = 0

  for (const range of ranges) {
    if (range.start < latestEnd) {
      return true
    }

    latestEnd = Math.max(latestEnd, range.end)
  }

  return false
}

export function getCompletedClockifyTimeEntryOverlapFixes(entries: TimeEntryWithRatesDtoV1[]) {
  const ranges = entries
    .map(getCompletedTimeEntryRange)
    .filter((range): range is CompletedTimeEntryRange => Boolean(range))
    .sort((left, right) => left.start - right.start)

  const fixes: ClockifyTimeEntryOverlapFix[] = []
  let latestEnd = 0

  for (const range of ranges) {
    const duration = range.end - range.start
    let start = range.start
    let end = range.end

    if (start < latestEnd) {
      start = latestEnd
      end = start + duration
      fixes.push({ end: new Date(end), entry: range.entry, start: new Date(start) })
    }

    latestEnd = Math.max(latestEnd, end)
  }

  return fixes
}

function getCompletedTimeEntryRange(entry: TimeEntryWithRatesDtoV1): CompletedTimeEntryRange | null {
  const start = parseTime(entry.timeInterval?.start)
  const end = parseTime(entry.timeInterval?.end)

  if (start === null || end === null || end <= start) {
    return null
  }

  return { end, entry, start }
}

function parseTime(value: string | undefined) {
  if (!value) {
    return null
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}
