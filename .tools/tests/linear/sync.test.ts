import type { AssignedIssueNode } from '../../../src/services/linear/tickets'

import { PaginationOrderBy } from '@linear/sdk'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'

import { db } from '../../../src/services/db'
import {
  clearSyncedLinearTickets,
  linearTicketSyncQueryOptions,
  syncLinearTickets,
  withLinearSessionChange,
} from '../../../src/services/linear/sync'
import { createLinearTicketCache, linearTicketCache } from '../../../src/services/linear/ticket-cache'
import * as linearApi from '../../../src/services/linear/tickets'

const options = { orderBy: PaginationOrderBy.UpdatedAt, syncLimit: 3 }
function ticket(id: string, title = id): AssignedIssueNode {
  return {
    id,
    identifier: `APP-${id}`,
    title,
    url: `https://linear.app/acme/issue/APP-${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    state: { id: 'state', name: 'Todo', type: 'unstarted', position: 1, color: '#fff' },
    assignee: {
      id: 'viewer',
      name: 'Name',
      displayName: 'Display',
      initials: 'D',
      avatarUrl: null,
      avatarBackgroundColor: '#fff',
    },
  }
}
function page(viewerId: string, nodes: AssignedIssueNode[], hasNextPage = false, endCursor: string | null = null) {
  return {
    data: { viewer: { id: viewerId, assignedIssues: { nodes, pageInfo: { hasNextPage, endCursor } } } },
    status: 200,
  } as unknown as Awaited<ReturnType<typeof linearApi.requestAssignedIssuesPage>>
}
async function put(id: string, viewerId = 'viewer', title = id) {
  const cache = createLinearTicketCache(db)
  await cache.replace(viewerId, [ticket(id, title)], cache.beginSync(), 'before')
}
afterEach(async () => {
  vi.restoreAllMocks()
  linearTicketCache.resume()
  await clearSyncedLinearTickets()
})

test('a complete capped fetch upserts after every page and retains older and other-viewer rows', async () => {
  await put('older')
  await put('other', 'other-viewer')
  const read = vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockImplementation(async input => {
    expect(await db.linearTickets.get(['viewer', 'older'])).toBeDefined()
    expect(await db.linearTickets.get(['viewer', 'first'])).toBeUndefined()
    return input.after
      ? page('viewer', [ticket('last')])
      : page('viewer', [ticket('first'), ticket('second')], true, 'cursor')
  })
  const result = await syncLinearTickets(options)
  expect(read.mock.calls.map(([input]) => [input.first, input.after, input.orderBy])).toEqual([
    [3, null, options.orderBy],
    [1, 'cursor', options.orderBy],
  ])
  expect(result).toMatchObject({
    viewerId: 'viewer',
    pagesFetched: 2,
    ticketsFetched: 3,
    ticketsStored: 3,
    ticketsDeleted: 0,
  })
  expect(await db.linearTickets.get(['viewer', 'older'])).toBeDefined()
  expect(await db.linearTickets.get(['other-viewer', 'other'])).toBeDefined()
  expect(await db.linearTickets.get(['viewer', 'first'])).toMatchObject({
    viewerId: 'viewer',
    ticket: {
      identifier: 'APP-first',
      state: { type: 'unstarted', position: 1 },
      assignee: { displayName: 'Display' },
    },
  })
})

test('a thrown later page preserves previous rows and never applies the first page', async () => {
  await put('saved')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('first')], true, 'next'))
    .mockRejectedValueOnce(new Error('page failed'))
  await expect(syncLinearTickets(options)).rejects.toThrow('page failed')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
})

test('sync accepts nullable assignees and stores only selected fields at each level', async () => {
  const assigned = ticket('assigned')
  const expanded = {
    ...assigned,
    description: 'excluded body',
    state: { ...assigned.state, extra: 'excluded status data' },
    assignee: { ...assigned.assignee!, email: 'excluded@example.test' },
  }
  vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockResolvedValue(
    page('viewer', [expanded, { ...ticket('unassigned'), assignee: null }]),
  )
  await syncLinearTickets(options)
  expect((await db.linearTickets.get(['viewer', 'assigned']))?.ticket).toEqual(assigned)
  expect((await db.linearTickets.get(['viewer', 'unassigned']))?.ticket.assignee).toBeNull()
})

test('a malformed ticket on a later page prevents all fetched writes', async () => {
  await put('saved')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('first')], true, 'next'))
    .mockResolvedValueOnce(
      page('viewer', [
        { ...ticket('bad'), state: { ...ticket('bad').state, position: 'bad' } } as unknown as AssignedIssueNode,
      ]),
    )
  await expect(syncLinearTickets(options)).rejects.toThrow('Invalid Linear')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
})

test('a valid empty response establishes the viewer and retains prior rows', async () => {
  await put('saved')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockResolvedValue(page('viewer', []))
  expect(await syncLinearTickets(options)).toMatchObject({ viewerId: 'viewer', ticketsFetched: 0, ticketsDeleted: 0 })
  expect(linearTicketCache.getViewer()).toBe('viewer')
  expect(await db.linearTickets.get(['viewer', 'saved'])).toBeDefined()
})

test('a malformed later page leaves the prior cache and viewer unchanged', async () => {
  await put('saved')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('first')], true, 'next'))
    .mockResolvedValueOnce({ data: undefined, status: 200 } as unknown as Awaited<
      ReturnType<typeof linearApi.requestAssignedIssuesPage>
    >)
  await expect(syncLinearTickets(options)).rejects.toThrow('Invalid Linear')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
  expect(linearTicketCache.getViewer()).toBeNull()
})

test('manual interval performs the initial fetch without scheduling periodic refresh', async () => {
  const read = vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockResolvedValue(page('viewer', [ticket('initial')]))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const query = linearTicketSyncQueryOptions({ ...options, enabled: true, interval: 'manual' })
  const observer = new QueryObserver(client, query)
  try {
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = observer.subscribe(result => {
        if (result.isSuccess) {
          unsubscribe()
          resolve()
        } else if (result.isError) {
          unsubscribe()
          reject(result.error)
        }
      })
    })
    expect(query.refetchInterval).toBe(false)
    expect(read).toHaveBeenCalledOnce()
    expect(await db.linearTickets.get(['viewer', 'initial'])).toBeDefined()
  } finally {
    observer.destroy()
    client.clear()
  }
})

test('a different viewer on a later page rejects the entire fetch', async () => {
  await put('saved')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('first')], true, 'next'))
    .mockResolvedValueOnce(page('other-viewer', [ticket('foreign')]))
  await expect(syncLinearTickets(options)).rejects.toThrow('viewer changed')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
  expect(linearTicketCache.getViewer()).toBeNull()
})

test('GraphQL data plus errors fails without reconciling', async () => {
  await put('saved')
  const response = {
    ...page('viewer', [ticket('first')]),
    errors: [{ message: 'partial error' }],
  } as unknown as Awaited<ReturnType<typeof linearApi.requestAssignedIssuesPage>>
  vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockResolvedValue(response)
  await expect(syncLinearTickets(options)).rejects.toThrow('Invalid Linear')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
})

test('disconnect cleanup prevents an in-flight fetch from restoring rows', async () => {
  await put('saved')
  let release!: (result: Awaited<ReturnType<typeof linearApi.requestAssignedIssuesPage>>) => void
  const read = vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockReturnValue(
    new Promise(resolve => {
      release = resolve
    }),
  )
  const pending = syncLinearTickets(options)
  await vi.waitFor(() => expect(read).toHaveBeenCalled())
  await clearSyncedLinearTickets()
  release(page('viewer', [ticket('late')]))
  await expect(pending).rejects.toThrow('superseded')
  expect(await db.linearTickets.count()).toBe(0)
  expect(linearTicketCache.getViewer()).toBeNull()
})

test('an older fetch cannot supersede a newer sync', async () => {
  let release!: (result: Awaited<ReturnType<typeof linearApi.requestAssignedIssuesPage>>) => void
  const read = vi
    .spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve
      }),
    )
    .mockResolvedValueOnce(page('viewer', [ticket('newer')]))
  const older = syncLinearTickets(options)
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
  await syncLinearTickets(options)
  release(page('viewer', [ticket('older')]))
  await expect(older).rejects.toThrow('superseded')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['newer'])
})

test('the same issue ID can be retained separately for different viewers', async () => {
  await put('shared', 'viewer', 'First account')
  vi.spyOn(linearApi, 'requestAssignedIssuesPage').mockResolvedValue(
    page('other-viewer', [ticket('shared', 'Second account')]),
  )
  await syncLinearTickets(options)
  expect((await db.linearTickets.get(['viewer', 'shared']))?.ticket.title).toBe('First account')
  expect((await db.linearTickets.get(['other-viewer', 'shared']))?.ticket.title).toBe('Second account')
})

test('an offline failure preserves the verified viewer while an unexpected account change hides it', async () => {
  const read = vi
    .spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('saved')]))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(page('other-viewer', [ticket('foreign')]))
  await syncLinearTickets(options)
  await expect(syncLinearTickets(options)).rejects.toThrow('offline')
  expect(linearTicketCache.getViewer()).toBe('viewer')
  await expect(syncLinearTickets(options)).rejects.toThrow('viewer changed')
  expect(linearTicketCache.getViewer()).toBeNull()
  expect(await db.linearTickets.get(['viewer', 'saved'])).toBeDefined()
  expect(await db.linearTickets.get(['other-viewer', 'foreign'])).toBeUndefined()
  expect(read).toHaveBeenCalledTimes(3)
})

test('a repeated or missing continuation cursor rejects the complete sync', async () => {
  await put('saved')
  const read = vi
    .spyOn(linearApi, 'requestAssignedIssuesPage')
    .mockResolvedValueOnce(page('viewer', [ticket('one')], true, 'next'))
    .mockResolvedValueOnce(page('viewer', [ticket('two')], true, 'next'))
  await expect(syncLinearTickets(options)).rejects.toThrow('pagination cursor')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
  read.mockReset().mockResolvedValue(page('viewer', [ticket('one')], true, null))
  await expect(syncLinearTickets(options)).rejects.toThrow('pagination cursor')
  expect((await db.linearTickets.toArray()).map(row => row.id)).toEqual(['saved'])
})

test.each(['connect failure', 'connect cancelled', 'disconnect failure', 'disconnect cancelled'])(
  '%s releases sync without restoring the old viewer or accepting an old response',
  async errorMessage => {
    const read = vi
      .spyOn(linearApi, 'requestAssignedIssuesPage')
      .mockResolvedValueOnce(page('viewer', [ticket('saved')]))
    await syncLinearTickets(options)
    let release!: (result: Awaited<ReturnType<typeof linearApi.requestAssignedIssuesPage>>) => void
    read.mockReturnValueOnce(
      new Promise(resolve => {
        release = resolve
      }),
    )
    const old = syncLinearTickets(options)
    const rejection = expect(old).rejects.toThrow('superseded')
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await expect(
      withLinearSessionChange(async () => {
        throw new Error(errorMessage)
      }),
    ).rejects.toThrow(errorMessage)
    expect(linearTicketCache.getViewer()).toBeNull()
    release(page('viewer', [ticket('late')]))
    await rejection
    expect(await db.linearTickets.get(['viewer', 'late'])).toBeUndefined()
    read.mockResolvedValueOnce(page('viewer', [ticket('fresh')]))
    await syncLinearTickets(options)
    expect(linearTicketCache.getViewer()).toBe('viewer')
    expect(await db.linearTickets.get(['viewer', 'fresh'])).toBeDefined()
  },
)

test('overlapping account operations keep sync suspended until both settle', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const pending = withLinearSessionChange(() => gate)
  await withLinearSessionChange(async () => {})
  expect(() => linearTicketCache.beginSync()).toThrow('account is changing')
  release()
  await pending
  expect(() => linearTicketCache.beginSync()).not.toThrow()
})
