export function selectClockifyWorkspace<T extends { id?: string }>(
  user: { activeWorkspace?: string; defaultWorkspace?: string } | undefined,
  workspaces: T[] | undefined,
) {
  return (
    workspaces?.find(item => item.id === user?.activeWorkspace) ??
    workspaces?.find(item => item.id === user?.defaultWorkspace) ??
    workspaces?.[0]
  )
}
