import type { TimeEntryWithRatesDtoV1 } from '../../../src/services/clockify/generated/clockify'
import type { SyncedClockifyTimeEntry } from '../../../src/services/clockify/sync'

import { expect, test } from 'vitest'

import { createClockifyEntryCache } from '../../../src/services/clockify/entry-cache'
import { recentClockifyEntries } from '../../../src/services/clockify/entry-queries'
import {
  getCompletedClockifyTimeEntryOverlapFixes,
  hasCompletedClockifyTimeEntryOverlap,
} from '../../../src/services/clockify/overlaps'
import { getClockifyEntryTableRange, getClockifyPeriodRange } from '../../../src/services/clockify/ranges'
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

test('table ranges and disjoint overlap buckets use local calendar boundaries across DST', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const now = new Date('2025-03-10T19:00:00Z')
    const iso = (range: { start: Date; end: Date }) => [range.start.toISOString(), range.end.toISOString()]
    expect(iso(getClockifyEntryTableRange(1, now))).toEqual(['2025-03-10T07:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    expect(iso(getClockifyEntryTableRange(3, now))).toEqual(['2025-03-08T08:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    expect(iso(getClockifyEntryTableRange(7, now))).toEqual(['2025-03-04T08:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    const today = getClockifyPeriodRange('today', now)
    const week = getClockifyPeriodRange('week', now)
    const month = getClockifyPeriodRange('month', now)
    expect(iso(today)).toEqual(['2025-03-10T07:00:00.000Z', '2025-03-11T07:00:00.000Z'])
    expect(iso(week)).toEqual(['2025-03-04T08:00:00.000Z', '2025-03-10T07:00:00.000Z'])
    expect(iso(month)).toEqual(['2025-02-11T08:00:00.000Z', '2025-03-04T08:00:00.000Z'])
    expect(month.end.getTime()).toBe(week.start.getTime())
    expect(week.end.getTime()).toBe(today.start.getTime())
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
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
