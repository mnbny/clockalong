# Time tracking

Clockalong's primary app surface should optimize for quickly finding work that is relevant to Clockify time tracking. The dashboard is a Clockify companion workspace first, not a general project-management, GitHub, Linear, or invoicing view.

## Work-source scope

Clockify is the core time-tracking provider. Other sources provide context for trackable work items.

Current and planned work sources:

- Linear: external provider for assigned issues.
- Quick Timers: local source for reusable ad hoc timer presets.
- GitHub: planned external provider for pull-request-centered tracking and billing review.

Keep source-specific behavior in source-specific docs and modules until multiple implemented sources prove a useful shared abstraction. Shared language is useful in docs, but code should not over-generalize before GitHub exists.

## Linear ticket scope

The default ticket list should show Linear issues assigned to the current user across all statuses.

Do not hide backlog, todo, done, canceled, or otherwise terminal issues by default. The user may track research before an issue is formally in progress, and may also clock follow-up time after an issue is completed.

Showing all visible workspace issues should be a later escape hatch, not the default. The first useful workflow is personal assigned work, because it keeps the list focused and avoids turning Clockalong into a broad Linear browser.

## Dashboard ordering

Default ordering should be opinionated around time-tracking usefulness rather than mirroring any source exactly.

Prioritize:

- currently running Clockify timer
- recently clocked work items
- work items with time entries that likely need review or continuation
- active provider workflow states such as in progress, ready, or review requested
- recent source updates

Provider state should influence ordering, but it should not determine whether an item is visible by itself. Clockify activity should outrank provider workflow state because Clockalong exists to support time tracking.

The current Linear client-side order modes are:

- `custom`: relevance. The running ticket appears first, then recently tracked workable tickets, started tickets, unstarted tickets, backlog/triage tickets, recently tracked terminal tickets, and terminal/unknown tickets. Recent tracking uses the merged Clockify `lastTrackedAt`, not the local link timestamp. Linear status type drives the portable bucket, with workflow-state position, last-tracked time, updated date, and ticket identifier used as tie-breakers.
- `status`: Linear workflow type and workflow-state position, then updated date.
- `created`: created date descending.
- `updated`: updated date descending.
- `alphabetical`: ticket title.

Linear sync ordering is separate from dashboard ordering. The sync can choose Linear's `orderBy` field, but Linear's assigned-issues query does not expose a sort direction. Dashboard ordering is applied after the configured sync limit has been synced into the local collection.

`src/services/linear/tickets-sorting.ts` owns the client-side sorting rules. `src/components/LinearWidget.tsx` owns the dashboard Linear table wiring and renders nothing when Linear is unauthenticated. Keep the dashboard route focused on widget composition.

## Recency treatment

Recently clocked work should be easy to resume. The dashboard may use subtle recency styling, with stronger visual emphasis for the most recently clocked item and softer treatment for older recent items.

Recency should stay functional and restrained. The data that matters:

- whether a timer is active
- last tracked time
- total tracked duration for the item
- source status

Use Day.js relative time for last-tracked values, `humanize-duration` for total tracked duration, and formatted currency for tracked value. Clockify entry aggregation is derived from synced Clockify descriptions or local metadata that can be matched to a source item. Rows without matching Clockify entries show a restrained placeholder.

## Linear dashboard table

The dashboard Linear section is a data table, not a kanban or full Linear browser. Keep row density high enough for scanning.

Assigned Linear tickets should come from the local synced ticket collection in `src/services/linear/sync.ts`, not from component-level Linear pagination. The background sync stores the current viewer's compact assigned-ticket rows according to the `linearTicketSyncLimit`, `linearTicketSyncOrderBy`, and `linearTicketSyncInterval` settings, and `LinearWidget` subscribes with TanStack DB live queries for ticket-list data.

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

Keep the Clockify dashboard widget small and operational. It should support the moment when the user opens Clockalong to start, stop, resume, or review tracked work.

The first useful widget data is:

- running timer, including elapsed time and the linked source item when known
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

## Clockify source matching

Clockify is the system of record for time entries, but it does not provide first-class links to most external work-source items. Clockalong derives source ownership from provider-specific matching rules and, where available, small local registries.

For Linear, matching is intentionally based on Linear-provided identifiers rather than an invented parser. Build the local candidate list from synced Linear tickets, normalize identifiers and descriptions case-insensitively, and match by exact containment. Check longer identifiers first so a longer ticket ID wins before a shorter overlapping one.

Clockify entries without a matching synced Linear identifier are treated as unlinked. This is deliberate: manually created Clockify web entries become visible to Clockalong once the user includes the Linear issue ID in the description, and app resets can recover links from Clockify data without a local map.

For Quick Timers, `clockifyQuickTimerEntryLinks` is the local registry that records which preset created a Clockify entry. It should stay small and should not duplicate Clockify-owned entry data.

GitHub matching has not been researched yet. Do not assume whether matching should use pull-request numbers, URLs, branch names, commit SHAs, or explicit local metadata.

## Per-ticket Clockify summaries

`src/services/clockify/ticket-summaries.ts` owns the Clockify aggregation used by the dashboard's `Tracked`, `Total`, and `Value` columns.

Current behavior:

- Reads synced local Clockify entries for the selected Clockify user/workspace, plus the current running entry.
- Matches entries whose descriptions contain a synced Linear ticket identifier.
- Produces summaries keyed by Linear issue ID: `{ lastTrackedAt, totalTrackedSeconds, totalTrackedAmount, totalTrackedAmountCurrency }`.
- `LinearWidget` merges those summaries into the compact Linear ticket DTO before sorting and rendering.

Do not reintroduce a local Clockify-entry-to-Linear-ticket registry as the normal source of truth. If Clockify custom-field metadata is added later, it can become a stronger match source, but description identifiers remain the portable fallback.

The Linear table refresh button should refresh assigned Linear tickets, the Clockify entry sync, running timer state, and relevant summary reports. Refreshing only Linear leaves `Tracked` and `Total` stale.

## Controls

The dashboard should support alternate views or sort modes once source data is wired:

- default relevance sort
- recently clocked
- source status
- created date
- updated date
- alphabetical
- recently updated

Filtering can start small. Useful first filters are assigned work, recently clocked, active timers, done, backlog, and an all-visible fallback when broader source lookup is needed.

## Multi-source direction

Initial Linear integration can assume one connected authorization. Loading assigned tickets from multiple Linear workspaces is useful later, but it requires storing and managing multiple Linear OAuth authorizations and presenting the result without making the dashboard noisy.

When multi-workspace support exists, the dashboard should be able to aggregate assigned issues across connected workspaces while still making the workspace/team visible on each row.

GitHub should follow the same source discipline once researched: start narrow, show only work items that improve Clockify tracking and billing review, and avoid broad repository browsing until a concrete time-tracking workflow needs it.
