# Time tracking

Clinear's primary app surface should optimize for quickly finding Linear issues that are relevant to Clockify time tracking. The dashboard is a time-tracking workspace first, not a general Linear project-management view.

## Ticket scope

The default ticket list should show Linear issues assigned to the current user across all statuses.

Do not hide backlog, todo, done, canceled, or otherwise terminal issues by default. The user may track research before an issue is formally in progress, and may also clock follow-up time after an issue is completed.

Showing all visible workspace issues should be a later escape hatch, not the default. The first useful workflow is personal assigned work, because it keeps the list focused and avoids turning Clinear into a broad Linear browser.

## Dashboard ordering

Default ordering should be opinionated around time-tracking usefulness rather than mirroring Linear exactly.

Prioritize:

- currently running Clockify timer
- recently clocked Linear issues
- issues with time entries that likely need review or continuation
- active Linear workflow states such as in progress or ready
- recent Linear updates

Linear status should influence ordering, but it should not determine whether an issue is visible. Clockify activity should outrank Linear workflow state because Clinear exists to support time tracking.

The current client-side order modes are:

- `custom`: Clinear relevance. Linked/recently tracked tickets first, then linked-entry count, Linear status order, updated date, and ticket identifier.
- `status`: Linear workflow type and workflow-state position, then updated date.
- `created`: created date descending.
- `updated`: updated date descending.
- `alphabetical`: ticket title.

Linear fetch ordering is separate from dashboard ordering. The fetch can choose Linear's `orderBy` field, but Linear's assigned-issues query does not expose a sort direction. Dashboard ordering is applied only after the configured fetch limit has been loaded.

`src/services/linear/tickets-sorting.ts` owns the client-side sorting rules. Keep the route focused on rendering and storage/query wiring.

## Recency treatment

Recently clocked tickets should be easy to resume. The dashboard may use subtle recency styling, with stronger visual emphasis for the most recently clocked issue and softer treatment for older recent issues.

Recency should stay functional and restrained. The important data is:

- whether a timer is active
- last tracked time
- total tracked duration for the issue
- ticket status

Use Day.js relative time for the ticket row's last-tracked value and `humanize-duration` for total tracked duration. Clockify entry aggregation is wired through Clinear's local entry-link registry. Rows without linked Clockify entries show a restrained placeholder rather than guessing from Clockify descriptions.

## Dashboard ticket table

The dashboard Linear section is a data table, not a kanban or full Linear browser. Keep row density high enough for scanning.

Current columns:

- action: no visible heading. Shows a start button for inactive rows and a stop button for the row linked to the current running Clockify timer.
- `ID`: Linear identifier, bold monospace.
- `Status`: Linear status name in a badge using Linear's status color with locally computed contrasting text.
- `Ticket`: Linear title.
- `Tracked`: relative last tracked time.
- `Total`: total tracked duration.

Make the active tracked row visible without changing table density. Use a subtle accent background animation on the row and switch that row's action button to stop. Keep the stop control visually consistent with the start control; use DaisyUI's error color for the icon/hover treatment rather than a filled destructive button.

## Clockify dashboard widget

Keep the Clockify dashboard widget small and operational. It should support the moment when the user opens Clinear to start, stop, resume, or review time on a Linear ticket.

The first useful widget data is:

- running timer, including elapsed time and the linked Linear ticket when known
- tracked time and rate-derived amount for today
- tracked time and rate-derived amount for this week
- tracked time and rate-derived amount for this month

Use rate-derived amount language such as value or earned amount. Do not frame this widget around invoicing, billing approval, profit, or reconciliation yet. Those concepts may matter later, but the near-term product is a time tracker.

Fetch the running timer from Clockify time entries with a tiny page size. Fetch today, week, and month totals from Clockify summary reports, not by loading broad time-entry pages and aggregating in the webview.

Broad Clockify entry reads should come from the local synced entry collection in `src/services/clockify/sync.ts`, not from component-level Clockify pagination. The background sync stores recent entries according to the `clockifyEntrySyncDays` setting, and UI code should subscribe with TanStack DB live queries when it needs entry-level data.

Overlap detection reads completed synced entries and ignores running entries. The current periods are intentionally non-overlapping: today, the previous six days, and days seven through twenty-seven ago. Overlapping completed entries show an `Overlap detected` error badge under only the affected period.

Clicking the overlap badge opens a confirmation dialog with dated before/after ranges for each entry that would move. The repair preserves each entry's duration, keeps non-overlapping entries in place, and shifts overlapping entries forward until that period has no completed-entry overlap. The app updates only changed Clockify entries, then refreshes the entry sync and summary reports.

The widget may expose a compact review table for today's synced entries. Keep it visually aligned with the app's existing data-table patterns and use it as a read-only view of the local collection.

The status badge has only two states:

- `Running`: DaisyUI `badge-success`, pulsing.
- `Not Running`: DaisyUI `badge-error`.

Do not add separate loading or unavailable labels to this badge. The fallback visual state is `Not Running`; use logs, spinners, or toasts for errors and loading when they help.

## Clockify entry links

Clockify does not provide a first-class Linear issue link. Treat Clinear's local link registry as the canonical mapping from Clockify time entries to Linear tickets.

For the first pass, keep the registry intentionally small:

- use the Clockify time entry ID as the map key
- store the canonical Linear issue ID
- store a `linkedAt` timestamp for debugging and future migration

This registry is stored as `clockifyLinearEntryLinks`, where each value has `{ linearIssueId, linkedAt }`.

Do not duplicate Clockify project, task, duration, description, or title in this registry. Fetch Clockify fields from Clockify and Linear fields from Linear. The registry only answers which Linear ticket a Clockify time entry belongs to.

Clockify descriptions should still include the Linear identifier for human readability and search, but descriptions are not the source of truth for links.

## Per-ticket Clockify summaries

`src/services/clockify/ticket-summaries.ts` owns the Clockify aggregation used by the dashboard's `Tracked` and `Total` columns.

Current behavior:

- Reads `clockifyLinearEntryLinks` to know which Clockify entry IDs belong to which Linear issue IDs.
- Reads synced local Clockify entries from the earliest linked timestamp forward, plus the current running entry.
- Matches only entries whose IDs exist in the local link registry.
- Produces summaries keyed by Linear issue ID: `{ lastTrackedAt, totalTrackedSeconds }`.
- The dashboard merges those summaries into the compact Linear ticket DTO before sorting and rendering.

Do not parse Clockify descriptions to infer links in this path. Description parsing can be a future migration/import tool, but it should not become the normal source of truth for the table.

The Linear table refresh button should refresh assigned Linear tickets, the Clockify entry sync, running timer state, and relevant summary reports. Refreshing only Linear leaves `Tracked` and `Total` stale.

## Controls

The dashboard should support alternate views or sort modes once data is wired:

- default relevance sort
- recently clocked
- Linear status
- created date
- updated date
- alphabetical
- recently updated

Filtering can start small. Useful first filters are assigned work, recently clocked, active timers, done, backlog, and an all-visible fallback when broader issue lookup is needed.

## Multi-workspace direction

Initial Linear integration can assume one connected authorization. Loading assigned tickets from multiple Linear workspaces is useful later, but it requires storing and managing multiple Linear OAuth authorizations and presenting the result without making the dashboard noisy.

When multi-workspace support exists, the dashboard should be able to aggregate assigned issues across connected workspaces while still making the workspace/team visible on each row.
