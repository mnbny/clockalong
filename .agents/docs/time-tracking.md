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

- `custom`: relevance. The running ticket appears first, then recently tracked workable tickets, started tickets, unstarted tickets, backlog/triage tickets, recently tracked terminal tickets, and terminal/unknown tickets. Recent tracking uses the merged Clockify `lastTrackedAt`, not the local link timestamp. Linear status type drives the portable bucket, with workflow-state position, last-tracked time, updated date, and ticket identifier used as tie-breakers.
- `status`: Linear workflow type and workflow-state position, then updated date.
- `created`: created date descending.
- `updated`: updated date descending.
- `alphabetical`: ticket title.

Linear sync ordering is separate from dashboard ordering. The sync can choose Linear's `orderBy` field, but Linear's assigned-issues query does not expose a sort direction. Dashboard ordering is applied after the configured sync limit has been synced into the local collection.

`src/services/linear/tickets-sorting.ts` owns the client-side sorting rules. Keep the route focused on rendering and storage/query wiring.

## Recency treatment

Recently clocked tickets should be easy to resume. The dashboard may use subtle recency styling, with stronger visual emphasis for the most recently clocked issue and softer treatment for older recent issues.

Recency should stay functional and restrained. The important data is:

- whether a timer is active
- last tracked time
- total tracked duration for the issue
- ticket status

Use Day.js relative time for the ticket row's last-tracked value, `humanize-duration` for total tracked duration, and formatted currency for tracked value. Clockify entry aggregation is derived from synced Clockify descriptions that contain a local Linear ticket identifier. Rows without matching Clockify entries show a restrained placeholder.

## Dashboard ticket table

The dashboard Linear section is a data table, not a kanban or full Linear browser. Keep row density high enough for scanning.

Assigned Linear tickets should come from the local synced ticket collection in `src/services/linear/sync.ts`, not from component-level Linear pagination. The background sync stores the current viewer's compact assigned-ticket rows according to the `linearTicketSyncLimit`, `linearTicketSortBy`, and `linearTicketSyncInterval` settings, and UI code should subscribe with TanStack DB live queries when it needs ticket-list data.

Current columns:

- action: no visible heading. Shows a start button for inactive rows and a stop button for the row linked to the current running Clockify timer.
- `ID`: Linear identifier, bold monospace.
- `Status`: Linear status name in a badge using Linear's status color with locally computed contrasting text.
- `Ticket`: Linear title.
- `Tracked`: relative last tracked time.
- `Total`: total tracked duration.
- `Value`: rate-derived tracked value when Clockify returns a usable hourly rate and currency.

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

Broad Clockify entry reads should come from the local synced entry collection in `src/services/clockify/sync.ts`, not from component-level Clockify pagination. The background sync stores recent entries according to the `clockifyEntrySyncDays` and `clockifyEntrySyncInterval` settings, and UI code should subscribe with TanStack DB live queries when it needs entry-level data.

Overlap detection reads completed synced entries and ignores running entries. The current periods are intentionally non-overlapping: today, the previous six days, and days seven through twenty-seven ago. Overlapping completed entries show an `Overlap detected` error badge under only the affected period.

Clicking the overlap badge opens a confirmation dialog with dated before/after ranges for each entry that would move. The repair preserves each entry's duration, keeps non-overlapping entries in place, and shifts overlapping entries forward until that period has no completed-entry overlap. The app updates only changed Clockify entries, then refreshes the entry sync and summary reports.

The widget may expose a compact review table for today's synced entries. Keep it visually aligned with the app's existing data-table patterns and use it as a read-only view of the local collection.

The status badge has only two states:

- `Running`: DaisyUI `badge-success`, pulsing.
- `Not Running`: DaisyUI `badge-error`.

Do not add separate loading or unavailable labels to this badge. The fallback visual state is `Not Running`; use logs, spinners, or toasts for errors and loading when they help.

## Clockify ticket matching

Clockify does not provide a first-class Linear issue link. Clinear derives ticket ownership from Clockify time-entry descriptions by comparing each description against the identifiers in the local synced Linear ticket collection.

Matching is intentionally based on Linear-provided identifiers rather than an invented parser. Build the local candidate list from synced Linear tickets, normalize identifiers and descriptions case-insensitively, and match by exact containment. Check longer identifiers first so a longer ticket ID wins before a shorter overlapping one.

Clockify entries without a matching synced Linear identifier are treated as unlinked. This is deliberate: manually created Clockify web entries become visible to Clinear once the user includes the Linear issue ID in the description, and app resets can recover links from Clockify data without a local map.

## Per-ticket Clockify summaries

`src/services/clockify/ticket-summaries.ts` owns the Clockify aggregation used by the dashboard's `Tracked`, `Total`, and `Value` columns.

Current behavior:

- Reads synced local Clockify entries for the selected Clockify user/workspace, plus the current running entry.
- Matches entries whose descriptions contain a synced Linear ticket identifier.
- Produces summaries keyed by Linear issue ID: `{ lastTrackedAt, totalTrackedSeconds, totalTrackedAmount, totalTrackedAmountCurrency }`.
- The dashboard merges those summaries into the compact Linear ticket DTO before sorting and rendering.

Do not reintroduce a local Clockify-entry-to-Linear-ticket registry as the normal source of truth. If Clockify custom-field metadata is added later, it can become a stronger match source, but description identifiers remain the portable fallback.

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
