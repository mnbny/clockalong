# Time tracking

Clockalong's primary app surface should optimize for quickly finding work that is relevant to Clockify time tracking. The dashboard is a Clockify companion workspace first, not a general project-management, GitHub, Linear, or invoicing view.

## Work-source scope

Clockify is the core time-tracking provider. Other sources provide context for trackable work items.

Current work sources:

- Linear: external provider for assigned issues.
- Quick Timers: local source for reusable ad hoc timer presets.
- GitHub: external provider for repository-scoped issues and pull requests.

Keep source-specific behavior in source-specific docs and modules unless a shared abstraction already has more than one real caller. The shared Clockify work-item summary path exists because Linear and GitHub both use internal refs for tracked totals. Provider auth, sync, settings, and table-specific behavior should stay in provider modules.

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

- `custom`: relevance. The running ticket appears first. Recently tracked started, unstarted, backlog, and triage tickets follow. Other started tickets, unstarted tickets, backlog/triage tickets, and terminal/unknown tickets come after them. Terminal tickets never receive a recency boost. Recent tracking uses the merged Clockify `lastTrackedAt`, not the local link timestamp. Linear status type drives the portable bucket, with workflow-state position, last-tracked time, updated date, and ticket identifier used as tie-breakers.
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

The relevance recent window is seven days. When a Linear timer stops, the completed Clockify entry returned by the stop request is upserted into the local Clockify entry cache before the widget refreshes its queries. Relevance sorting can then use the new `lastTrackedAt` immediately, so the ticket does not fall back to its previous position.

Use Day.js relative time for last-tracked values, `humanize-duration` for total tracked duration, and formatted currency for tracked value. Clockify entry aggregation is derived from synced Clockify descriptions that contain Clockalong's `ref:*` internal marker. Rows without matching Clockify entries show a restrained placeholder.

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
- external link: no visible heading. Opens the source item in Linear.

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

The widget may expose a compact table for today's synced entries. Keep it visually aligned with the app's existing data-table patterns. Users can edit an entry's start time, end time, or duration from this table when they need to correct tracked time quickly. Do not add adjacent-entry overlap protection to that edit flow; Clockalong should accept intentional overbilling here.

The status badge has only two states:

- `Running`: DaisyUI `badge-success`, pulsing.
- `Not Running`: DaisyUI `badge-error`.

Do not add separate loading or unavailable labels to this badge. The fallback visual state is `Not Running`; use logs, spinners, or toasts for errors and loading when they help.

## Clockify source matching

Clockify is the system of record for time entries, but it does not provide first-class links to most external work-source items. Clockalong derives source ownership from provider-specific matching rules and, where available, small local registries.

Provider-backed templates should include `{internal-ref}`. It renders to a stable, human-debuggable marker in the Clockify description:

- Linear: `ref:linear:{workspaceSlug}:{issueIdentifier}`
- GitHub: `ref:github:{owner}/{repo}:{issue|pr}:{number}`

Use the shared parser and formatter in `src/utils/templates.ts`; do not hand-roll provider regexes in widgets. Entries without a supported internal ref are treated as unlinked.

For Quick Timers, `clockifyQuickTimerEntryLinks` is the local registry that records which preset created a Clockify entry. It should stay small and should not duplicate Clockify-owned entry data.

Do not reintroduce a local Clockify-entry-to-source-item registry as the normal source of truth. If Clockify custom-field metadata is added later, it can become a stronger match source, but Clockify-side description markers remain the portable fallback.

## Work-item Clockify summaries

`src/services/clockify/work-item-summaries.ts` owns the provider-neutral Clockify aggregation used by dashboard `Tracked`, `Total`, and `Value` columns. Provider wrappers such as `ticket-summaries.ts` and GitHub work-item summaries provide item IDs and internal refs.

Current behavior:

- Reads synced local Clockify entries for the selected Clockify user/workspace, plus the current running entry.
- Matches entries whose descriptions contain a supported internal ref.
- Produces summaries keyed by source item ID: `{ lastTrackedAt, totalTrackedSeconds, totalTrackedAmount, totalTrackedAmountCurrency }`.
- Provider widgets merge those summaries into compact table rows before sorting and rendering.

Provider table refresh buttons should refresh the provider sync, Clockify entry sync, and running timer state. Refreshing only the provider leaves `Tracked` and `Total` stale.

Existing Clockify entries that have been backfilled for Clockalong should contain the same `ref:*` markers as newly created entries. Do not reintroduce old description-shape matching for unmarked entries; unmarked entries are intentionally treated as unlinked until their descriptions carry an internal ref.

## GitHub dashboard table

The dashboard GitHub section is a repository-scoped work-item table for issues and pull requests, not a broad GitHub browser.

GitHub work items should come from the local synced collection in `src/services/github/sync.ts`, not from component-level GitHub pagination. The background sync stores rows for selected repositories according to `githubSelectedRepositories`, `githubVisibleWorkItemTypes`, and `githubWorkItemSyncLimit`, and `GitHubWidget` subscribes with TanStack DB live queries.

Current columns:

- action: no visible heading. Shows a start button for inactive rows and a stop button for the row linked to the current running Clockify timer.
- `ID`: `PR#{number}` or `Issue#{number}`, bold monospace.
- `Repository`: compact repository name.
- author avatar: no visible heading.
- `Item`: issue or pull-request title.
- `Tracked`: relative last tracked time.
- `Total`: total tracked duration.
- `Value`: rate-derived tracked value when Clockify returns a usable hourly rate and currency.
- external link: no visible heading. Opens the source item in GitHub.

The GitHub widget header has controls for refresh, multi-author filtering, a transient `Show all` override, and closed-item visibility. The author filter always includes the connected GitHub viewer and can include persisted additional authors. Author filtering and `Show all` affect the dashboard only. Repository and work-item-type settings determine what enters the local cache.

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

GitHub should stay narrow: show only selected repositories and configured work-item types that improve Clockify tracking and billing review. Avoid broad repository browsing until a concrete time-tracking workflow needs it.
