import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'
import type { SyncedClockifyTimeEntry } from '../../../src/services/clockify/sync'

import { expect, test } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { recentClockifyEntries } from '../../../src/services/clockify/entry-queries'
import {
  getCompletedClockifyTimeEntryOverlapFixes,
  hasCompletedClockifyTimeEntryOverlap,
} from '../../../src/services/clockify/overlaps'
import {
  getClockifyEntryTableRange,
  getClockifyMonthRange,
  getClockifyPeriodRange,
} from '../../../src/services/clockify/ranges'
import { DB } from '../../../src/services/db'
import { buildMcpSnapshot } from '../../../src/services/mcp/snapshot'

function row(
  id: string,
  start: string,
  end?: string,
  description = id,
  userId = 'user',
  workspaceId = 'workspace',
): SyncedClockifyTimeEntry {
  return {
    id,
    userId,
    workspaceId,
    startedAt: start,
    syncedAt: start,
    entry: { id, userId, workspaceId, description, timeInterval: { start, end } },
  }
}

test('table ranges use local calendar boundaries across DST', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const now = new Date('2025-03-10T19:00:00Z')
    const iso = (range: { start: Date; end: Date }) => [range.start.toISOString(), range.end.toISOString()]
    expect(iso(getClockifyEntryTableRange(1, now))).toEqual(['2025-03-10T07:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    expect(iso(getClockifyEntryTableRange(3, now))).toEqual(['2025-03-08T08:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    expect(iso(getClockifyEntryTableRange(7, now))).toEqual(['2025-03-04T08:00:00.000Z', '2025-03-11T07:00:00.000Z'])
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test.each([
  ['today', '2026-03-08T20:00:00Z', 'MONDAY', '2026-03-08T08:00:00.000Z', '2026-03-09T07:00:00.000Z'],
  ['week', '2026-03-11T20:00:00Z', 'SUNDAY', '2026-03-08T08:00:00.000Z', '2026-03-15T07:00:00.000Z'],
  ['week', '2026-03-11T20:00:00Z', 'MONDAY', '2026-03-09T07:00:00.000Z', '2026-03-16T07:00:00.000Z'],
  ['week', '2026-11-04T20:00:00Z', 'SUNDAY', '2026-11-01T07:00:00.000Z', '2026-11-08T08:00:00.000Z'],
  ['month', '2026-03-11T20:00:00Z', 'MONDAY', '2026-03-01T08:00:00.000Z', '2026-04-01T07:00:00.000Z'],
  ['month', '2026-01-01T00:30:00Z', 'MONDAY', '2025-12-01T08:00:00.000Z', '2026-01-01T08:00:00.000Z'],
] as const)(
  'calendar %s ranges follow the profile timezone and week start at %s (%s)',
  (period, instant, weekStart, start, end) => {
    const range = getClockifyPeriodRange(period, new Date(instant), 'America/Los_Angeles', weekStart)
    expect([range.start.toISOString(), range.end.toISOString()]).toEqual([start, end])
  },
)

test.each([
  ['2026-03-31T20:00:00Z', 'America/Los_Angeles', '2026-03-01T08:00:00.000Z'],
  ['2026-11-08T20:00:00Z', 'America/Los_Angeles', '2026-11-01T07:00:00.000Z'],
  ['2026-01-01T00:30:00Z', 'America/Los_Angeles', '2025-12-01T08:00:00.000Z'],
  ['2026-01-31T20:30:00Z', 'Asia/Kolkata', '2026-01-31T18:30:00.000Z'],
])('month repairs use the profile timezone at %s (%s)', (instant, timeZone, start) => {
  const now = new Date(instant)
  const range = getClockifyMonthRange(now, timeZone)
  expect(range.start.toISOString()).toBe(start)
  expect(range.end.getTime()).toBe(now.getTime())
})

test('overlap detection excludes running and adjacent entries but repairs overlapping completed entries', () => {
  const rows: TimeEntryWithRatesDtoV1[] = [
    row('a', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z').entry,
    row('adjacent', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z').entry,
    row('running', '2026-01-01T10:30:00Z').entry,
  ]
  expect(hasCompletedClockifyTimeEntryOverlap(rows)).toBe(false)
  const overlap = row('overlap', '2026-01-01T10:30:00Z', '2026-01-01T11:30:00Z').entry
  expect(hasCompletedClockifyTimeEntryOverlap([...rows, overlap])).toBe(true)
  expect(getCompletedClockifyTimeEntryOverlapFixes([...rows, overlap]).map(fix => fix.entry.id)).toEqual([
    'overlap',
    'adjacent',
  ])
})

test('menu recent rows sort newest first, deduplicate titles, exclude running and obey the limit', async () => {
  const rows = [
    row('old-a', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 'Task A'),
    row('new-a', '2026-01-03T10:00:00Z', '2026-01-03T11:00:00Z', ' Task A '),
    row('b', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z', 'Task B'),
    row('running', '2026-01-04T10:00:00Z', undefined, 'Running'),
    row('active-id', '2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z', 'Active'),
    row('c', '2025-12-31T10:00:00Z', '2025-12-31T11:00:00Z', 'Task C'),
  ]
  const db = new DB(`clockify-menu-${crypto.randomUUID()}`)
  const cache = createClockifyEntryCache(db)
  try {
    for (const row of rows) await cache.upsert(row.entry, { userId: 'user', workspaceId: 'workspace' })
    expect(
      (await recentClockifyEntries(db, { userId: 'user', workspaceId: 'workspace' }, 'active-id', 2)).map(
        entry => entry.id,
      ),
    ).toEqual(['new-a', 'b'])
  } finally {
    db.close()
    await db.delete()
  }
})

test('MCP recent periods use half-open local day ranges, scope and completed entries only', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const now = new Date('2025-03-10T19:00:00Z')
    const rows = [
      row('today-start', '2025-03-10T07:00:00Z', '2025-03-10T08:00:00Z'),
      row('three-start', '2025-03-08T08:00:00Z', '2025-03-08T09:00:00Z'),
      row('seven-start', '2025-03-04T08:00:00Z', '2025-03-04T09:00:00Z'),
      row('before-seven', '2025-03-04T07:59:59Z', '2025-03-04T08:30:00Z'),
      row('future-end', '2025-03-11T07:00:00Z', '2025-03-11T08:00:00Z'),
      row('running', '2025-03-10T09:00:00Z'),
      row('other', '2025-03-10T09:00:00Z', '2025-03-10T10:00:00Z', 'other', 'other'),
    ]
    const snapshot = buildMcpSnapshot({
      clockifyConnected: true,
      clockifyUserId: 'user',
      clockifyWorkspaceId: 'workspace',
      syncedClockifyEntries: rows,
      now,
    })
    expect(snapshot.recentEntries['1'].map(entry => entry.entryId)).toEqual(['today-start'])
    expect(snapshot.recentEntries['3'].map(entry => entry.entryId)).toEqual(['today-start', 'three-start'])
    expect(snapshot.recentEntries['7'].map(entry => entry.entryId)).toEqual([
      'today-start',
      'three-start',
      'seven-start',
    ])
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})
