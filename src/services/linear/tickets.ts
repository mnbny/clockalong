import type { LinearTicketSortByOption } from '../storage/config'
import type { Issue, LinearClient, User, WorkflowState } from '@linear/sdk'

import { auth } from '../tauri/auth-client'
import { createLinearClient } from './client'

const linearTicketsPageSize = 50

export type LinearTicketAssignee = Pick<
  User,
  'avatarBackgroundColor' | 'avatarUrl' | 'displayName' | 'id' | 'initials' | 'name'
>

export type LinearTicketStatus = Pick<WorkflowState, 'color' | 'id' | 'name' | 'position' | 'type'>

type SerializedIssueFields = Omit<
  Pick<Issue, 'createdAt' | 'id' | 'identifier' | 'title' | 'updatedAt'>,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string
  updatedAt: string
}

export type LinearTicket = {
  assignee: LinearTicketAssignee | null
  createdAt: string
  id: string
  identifier: string
  lastTrackedAt: string | null
  status: LinearTicketStatus
  title: string
  totalTrackedSeconds: number | null
  updatedAt: string
}

export type GetAssignedLinearTicketsOptions = {
  fetchLimit: number
  sortBy: LinearTicketSortByOption
}

type AssignedIssueNode = SerializedIssueFields & {
  assignee: LinearTicketAssignee | null
  state: LinearTicketStatus
}

type AssignedIssuesResponse = {
  viewer: {
    assignedIssues: {
      nodes: AssignedIssueNode[]
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
    }
  }
}
type AssignedIssuesPage = AssignedIssuesResponse['viewer']['assignedIssues']
type AssignedIssuesVariables = {
  after?: string | null
  first: number
  orderBy: LinearTicketSortByOption
}

const assignedTicketsQuery = `
  query DashboardAssignedTickets($first: Int!, $after: String, $orderBy: PaginationOrderBy) {
    viewer {
      assignedIssues(first: $first, after: $after, orderBy: $orderBy) {
        nodes {
          id
          identifier
          title
          createdAt
          updatedAt
          state {
            id
            name
            type
            color
            position
          }
          assignee {
            id
            name
            displayName
            initials
            avatarUrl
            avatarBackgroundColor
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`

export async function getAssignedLinearTickets(options: GetAssignedLinearTicketsOptions): Promise<LinearTicket[]> {
  const fetchLimit = normalizeFetchLimit(options.fetchLimit)
  const assignedIssues: AssignedIssuesResponse['viewer']['assignedIssues']['nodes'] = []
  let after: string | null = null
  let hasNextPage = true
  let pageNumber = 0

  linearTicketsLog('assigned fetch start', {
    fetchLimit,
    pageSize: linearTicketsPageSize,
    sortBy: options.sortBy,
  })

  while (assignedIssues.length < fetchLimit && hasNextPage) {
    const first = Math.min(linearTicketsPageSize, fetchLimit - assignedIssues.length)

    pageNumber += 1
    linearTicketsLog('assigned fetch page request', {
      afterPresent: Boolean(after),
      first,
      pageNumber,
      sortBy: options.sortBy,
    })

    const response = await requestAssignedIssuesPage({
      after,
      first,
      orderBy: options.sortBy,
    })
    const nextPage: AssignedIssuesPage | undefined = response.data?.viewer.assignedIssues

    if (!nextPage) {
      linearTicketsLog('assigned fetch page missing data', {
        pageNumber,
        responseStatus: response.status,
      })
      break
    }

    assignedIssues.push(...nextPage.nodes)
    after = nextPage.pageInfo.endCursor
    hasNextPage = nextPage.pageInfo.hasNextPage && Boolean(after)

    linearTicketsLog('assigned fetch page response', {
      aggregateCount: assignedIssues.length,
      endCursorPresent: Boolean(nextPage.pageInfo.endCursor),
      hasNextPage: nextPage.pageInfo.hasNextPage,
      nodeCount: nextPage.nodes.length,
      pageNumber,
      stateTypeCounts: getStateTypeCounts(nextPage.nodes),
    })
  }

  const tickets = assignedIssues.map(issue => ({
    assignee: issue.assignee,
    createdAt: issue.createdAt,
    id: issue.id,
    identifier: issue.identifier,
    lastTrackedAt: null,
    status: issue.state,
    title: issue.title,
    totalTrackedSeconds: null,
    updatedAt: issue.updatedAt,
  }))

  linearTicketsLog('assigned fetch complete', {
    fetchedCount: tickets.length,
    pageCount: pageNumber,
    stateTypeCounts: getTicketStateTypeCounts(tickets),
  })

  return tickets
}

async function requestAssignedIssuesPage(variables: AssignedIssuesVariables) {
  const linearClient = await createLinearClient()
  return requestAssignedIssuesPageWithClient(linearClient, variables, true)
}

async function requestAssignedIssuesPageWithClient(
  linearClient: LinearClient,
  variables: AssignedIssuesVariables,
  allowCredentialRefresh: boolean,
) {
  try {
    const response = await linearClient.client.rawRequest<AssignedIssuesResponse, AssignedIssuesVariables>(
      assignedTicketsQuery,
      variables,
    )

    if (response.status !== 401 || !allowCredentialRefresh) {
      return response
    }
  } catch (error) {
    if (!allowCredentialRefresh || !isUnauthorizedLinearError(error)) {
      throw error
    }
  }

  linearTicketsLog('assigned fetch unauthorized, refreshing Linear credential')
  await auth.refreshLinearCredential()
  const retryClient = await createLinearClient()
  return requestAssignedIssuesPageWithClient(retryClient, variables, false)
}

function isUnauthorizedLinearError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as {
    response?: { status?: number }
    status?: number
  }

  return maybeError.status === 401 || maybeError.response?.status === 401
}

function normalizeFetchLimit(fetchLimit: number) {
  if (!Number.isFinite(fetchLimit)) {
    return linearTicketsPageSize
  }

  return Math.max(1, Math.floor(fetchLimit))
}

function getStateTypeCounts(issues: AssignedIssueNode[]) {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.state.type] = (counts[issue.state.type] ?? 0) + 1
    return counts
  }, {})
}

function getTicketStateTypeCounts(tickets: LinearTicket[]) {
  return tickets.reduce<Record<string, number>>((counts, ticket) => {
    counts[ticket.status.type] = (counts[ticket.status.type] ?? 0) + 1
    return counts
  }, {})
}

function linearTicketsLog(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[linear tickets] ${message}`)
    return
  }

  console.info(`[linear tickets] ${message}`, details)
}
