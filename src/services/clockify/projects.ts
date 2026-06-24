import type { ClockifyDefaultProject } from '../storage/config'

import { clockify } from './client'

export const clockifyProjectOptionsQueryKey = ['clockify', 'project-options'] as const

export type ClockifyProjectOption = NonNullable<ClockifyDefaultProject>

export async function getClockifyProjectOptions(): Promise<ClockifyProjectOption[]> {
  const [user, workspaces] = await Promise.all([clockify.getLoggedUser(), clockify.getWorkspacesOfUser()])
  const workspace =
    workspaces.find(candidate => candidate.id === user.activeWorkspace) ??
    workspaces.find(candidate => candidate.id === user.defaultWorkspace) ??
    workspaces[0]

  if (!workspace?.id) {
    return []
  }

  const workspaceId = workspace.id
  const projects = await clockify.getProjects({
    params: { workspaceId },
    queries: {
      archived: false,
      page: 1,
      'page-size': 100,
      'sort-column': 'NAME',
      'sort-order': 'ASCENDING',
    },
  })

  return projects.flatMap(project => {
    if (!project.id || !project.name) {
      return []
    }

    return {
      projectId: project.id,
      projectName: project.name,
      workspaceId,
      workspaceName: workspace.name ?? 'Clockify workspace',
    }
  })
}

export function getClockifyProjectOptionValue(option: ClockifyProjectOption) {
  return `${option.workspaceId}:${option.projectId}`
}
