import type { GithubIssueWorkItem, SyncedGithubWorkItem } from '../../../src/services/github/sync'

import { afterEach, expect, test } from 'vitest'

import { DB } from '../../../src/services/db'
import { createGithubWorkItemCache } from '../../../src/services/github/work-item-cache'
import {
  getGithubSelectedAuthorUsernames,
  getGithubSelectedLabelNames,
  mergeGithubAuthors,
} from '../../../src/services/github/work-item-filters'
import { queryGithubAuthors, queryGithubWorkItems } from '../../../src/services/github/work-item-queries'

const db = new DB(`filter-test-${crypto.randomUUID()}`)
const cache = createGithubWorkItemCache(db)
const scope = { repositories: ['owner/repo', 'other/repo'], visibleWorkItemTypes: { issues: true, pullRequests: true } }
afterEach(async () => {
  await cache.clear()
})

function issue(id: string, overrides: Partial<GithubIssueWorkItem> = {}): GithubIssueWorkItem {
  return {
    id,
    number: 1,
    title: id,
    author: null,
    authorAvatarUrl: null,
    item: { labels: [] },
    repositoryFullName: 'owner/repo',
    repositoryOwner: 'owner',
    repositoryUrl: 'https://github.com/owner/repo',
    state: 'open',
    syncedAt: '2026-01-01',
    type: 'issue',
    updatedAt: '2026-01-01',
    url: 'https://github.com/owner/repo/issues/1',
    ...overrides,
  }
}

test('author choices include the viewer and saved absent authors, deduplicate and fill missing avatars', async () => {
  const rows = [
    issue('1', { author: 'Alice', authorAvatarUrl: null }),
    issue('2', { author: ' alice ', authorAvatarUrl: 'https://example.test/alice.png' }),
    issue('3', { author: null }),
    issue('4', { author: 'bob' }),
  ]
  const saved = [
    { username: 'ABSENT', avatarUrl: null },
    { username: 'BOB', avatarUrl: null },
  ]
  const viewer = { username: 'Viewer', avatarUrl: 'https://example.test/viewer.png' }
  await cache.replace(rows, cache.beginSync(), scope)
  const authors = mergeGithubAuthors(await queryGithubAuthors(db, scope), saved, [viewer])
  expect(authors.map(author => author.username.trim().toLowerCase()).sort()).toEqual([
    'absent',
    'alice',
    'bob',
    'viewer',
  ])
  expect(authors.find(author => author.username.trim().toLowerCase() === 'alice')?.avatarUrl).toBe(
    'https://example.test/alice.png',
  )
  expect([...getGithubSelectedAuthorUsernames(viewer.username, saved)]).toEqual(['viewer', 'absent', 'bob'])
})

test('author, label and involvement filters are additive; show all and closed are independent', async () => {
  const rows: SyncedGithubWorkItem[] = [
    issue('viewer', { author: ' VIEWER ', updatedAt: '2026-01-04' }),
    issue('saved', { author: ' Alice ', updatedAt: '2026-01-05' }),
    issue('label-string', { item: { labels: [' Urgent '] }, updatedAt: '2026-01-02' }),
    issue('label-object', {
      item: { labels: [{ name: 'URGENT' }] as GithubIssueWorkItem['item']['labels'] },
      repositoryFullName: 'other/repo',
      updatedAt: '2026-01-03',
    }),
    issue('mention', { involvementReasons: ['mentioned'], updatedAt: '2026-01-06' }),
    issue('review', { involvementReasons: ['reviewRequested'], updatedAt: '2026-01-07' }),
    issue('closed', { author: 'viewer', state: 'closed', updatedAt: '2026-01-08' }),
    issue('unmatched', { updatedAt: '2026-01-09' }),
  ]
  const original = structuredClone(rows)
  await cache.replace(rows, cache.beginSync(), scope)
  const options = {
    scope,
    limit: 50,
    authors: [...getGithubSelectedAuthorUsernames('viewer', [{ username: 'ALICE', avatarUrl: null }])],
    labels: [...getGithubSelectedLabelNames([{ name: ' urgent ', color: 'fff' }])],
    showAll: false,
    showClosed: false,
    showMentioned: true,
  }
  expect((await queryGithubWorkItems(db, options)).rows.map(row => row.id)).toEqual([
    'review',
    'mention',
    'saved',
    'viewer',
    'label-object',
    'label-string',
  ])
  expect((await queryGithubWorkItems(db, { ...options, showMentioned: false })).rows.map(row => row.id)).toEqual([
    'saved',
    'viewer',
    'label-object',
    'label-string',
  ])
  expect((await queryGithubWorkItems(db, { ...options, showAll: true })).rows.map(row => row.id)).toEqual([
    'unmatched',
    'review',
    'mention',
    'saved',
    'viewer',
    'label-object',
    'label-string',
  ])
  expect(
    (await queryGithubWorkItems(db, { ...options, showAll: true, showClosed: true })).rows.map(row => row.id),
  ).toEqual(['unmatched', 'closed', 'review', 'mention', 'saved', 'viewer', 'label-object', 'label-string'])
  expect(rows).toEqual(original)
})
