import type { LinearTicketSyncOrderByOption } from './ticket-settings'
import type { Issue, LinearClient, User, WorkflowState } from '@linear/sdk'

import { z } from 'zod'

import { auth } from '../tauri/auth-client'
import { createLinearClient } from './client'

export type LinearTicketAssignee = Pick<
  User,
  'avatarBackgroundColor' | 'avatarUrl' | 'displayName' | 'id' | 'initials' | 'name'
>

export type LinearTicketStatus = Pick<WorkflowState, 'color' | 'id' | 'name' | 'position' | 'type'>

type SerializedIssueFields = Omit<
  Pick<Issue, 'createdAt' | 'id' | 'identifier' | 'title' | 'updatedAt' | 'url'>,
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
  totalTrackedAmount: number | null
  totalTrackedAmountCurrency: string | null
  totalTrackedSeconds: number | null
  updatedAt: string
  url: string
}

export type AssignedIssueNode = SerializedIssueFields & {
  assignee: LinearTicketAssignee | null
  state: LinearTicketStatus
}

export const AssignedIssueNodeSchema = z.object({
  id: z.string().min(1),
  identifier: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  state: z.object({ id: z.string(), name: z.string(), type: z.string(), color: z.string(), position: z.number() }),
  assignee: z
    .object({
      id: z.string(),
      name: z.string(),
      displayName: z.string(),
      initials: z.string(),
      avatarUrl: z.string().nullish(),
      avatarBackgroundColor: z.string(),
    })
    .nullable(),
}) satisfies z.ZodType<AssignedIssueNode>

export function toLinearTicket(issue: AssignedIssueNode): LinearTicket {
  return {
    assignee: issue.assignee,
    createdAt: issue.createdAt,
    id: issue.id,
    identifier: issue.identifier,
    lastTrackedAt: null,
    status: issue.state,
    title: issue.title,
    totalTrackedAmount: null,
    totalTrackedAmountCurrency: null,
    totalTrackedSeconds: null,
    updatedAt: issue.updatedAt,
    url: issue.url,
  }
}

type AssignedIssuesResponse = {
  viewer: {
    id: string
    assignedIssues: {
      nodes: AssignedIssueNode[]
      pageInfo: {
        endCursor: string | null
        hasNextPage: boolean
      }
    }
  }
}
export const AssignedIssuesPageSchema = z.object({
  nodes: z.array(AssignedIssueNodeSchema),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
})
export type AssignedIssuesVariables = {
  after?: string | null
  first: number
  orderBy: LinearTicketSyncOrderByOption
}

const assignedTicketsQuery = `
  query DashboardAssignedTickets($first: Int!, $after: String, $orderBy: PaginationOrderBy) {
    viewer {
      id
      assignedIssues(first: $first, after: $after, orderBy: $orderBy) {
        nodes {
          id
          identifier
          title
          url
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

export async function requestAssignedIssuesPage(variables: AssignedIssuesVariables) {
  linearTicketsLog('assigned fetch page request', {
    afterPresent: Boolean(variables.after),
    first: variables.first,
    orderBy: variables.orderBy,
  })

  const linearClient = await createLinearClient()
  const response = await requestAssignedIssuesPageWithClient(linearClient, variables, true)
  const page = response.data?.viewer.assignedIssues

  linearTicketsLog('assigned fetch page response', {
    endCursorPresent: Boolean(page?.pageInfo.endCursor),
    hasNextPage: page?.pageInfo.hasNextPage,
    nodeCount: page?.nodes.length ?? 0,
    responseStatus: response.status,
    stateTypeCounts: getStateTypeCounts(page?.nodes ?? []),
  })

  return response
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

function getStateTypeCounts(issues: AssignedIssueNode[]) {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.state.type] = (counts[issue.state.type] ?? 0) + 1
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
