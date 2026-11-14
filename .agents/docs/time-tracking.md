# Time tracking

The dashboard helps users find work, control Clockify timers, and review completed time. Source widgets combine work context with Clockify activity. Provider-specific filtering and sorting belong to each work source.

## Timer workflow

Users start timers from Linear issues, GitHub work items, or Quick Timer presets. The running item has an active treatment and a stop control. The Clockify widget provides a general stop control.

New source entries use the dashboard project override when present, otherwise the default project, plus the saved billable preference. Resuming an existing entry creates a new running entry from its trackable fields.

The Clockify widget shows the running timer and summary time and value for today, this week, and this month. Its entry table offers the same calendar periods, using the Clockify profile timezone and week-start setting. Without those settings, it uses the device timezone and Monday as the week start. Tracked value comes from Clockify rates; it is not an invoice or billing approval.

Entries appear newest first by start time. Today shows the full cached list. Week and Month use pagination. When the user changes periods or pages, the app uses the local cache and does not refresh Clockify. Cached entries can cover less history than the summary reports.

The app header owns manual tracking sync and its activity indicator. Individual widgets do not provide separate refresh buttons.

## Entry management

Right-clicking a source play control or Quick Timer card opens completed-time entry. Keyboard context-menu actions provide the same access. Left-click retains the normal timer action.

The manual form accepts fractional minutes and editable start and end times. New entries end at the time the form opens; changing duration moves the start backward. When editing an existing entry, changing duration keeps the start and moves the end.

Completed entry creation leaves the running timer unchanged. Overlaps are permitted. Provider entries keep their configured descriptions and internal references; copies of existing entries retain their trackable fields.

Successful writes update the local cache when the response identifies the entry, then refresh entries and reports. Stopping a timer makes its completed activity available for source summaries and ordering.

Users can delete individual entries from the Clockify table after confirmation. After Clockify confirms deletion, the app updates its local cache and refreshes entries, reports, and running timer state.

## Overlap repair

The Clockify header and MCP share one overlap repair operation. It repairs completed entries from the current calendar month and ignores running timers. The header action sits beside the timer status.

The range starts at midnight on the first day of the month and ends when repair starts. It uses the Clockify profile timezone, with the device timezone as a fallback.

The header action appears as a red badge only when cached entries show overlaps. It disappears when no overlaps remain. A click starts repair immediately from the cache, without a provider fetch first. Invoiced entries remain eligible for repair.

Repair preserves durations and moves overlapping entries forward while retaining entries that need no adjustment. Repairs use sequential bounded batches for one Clockify user and workspace. Rate-limit retries retain the calculated timestamps. Each response must confirm the batch before the next one proceeds.

Partial success remains saved. A failed request is not proof that no entries changed. After a repair attempt, the app refreshes the full month and reports. Only that sync updates the entry cache. A month without overlaps succeeds without changes.

## Entry collapse

The Clockify header and MCP share an entry collapse operation. It combines short completed entries from the cached current month across the active workspace. Its date range follows the same calendar and timezone rules as overlap repair.

The maximum entry duration defaults to five minutes, inclusive. Entries with zero duration are eligible. A group can also have a total duration of zero.

The chunk size defaults to one hour. Each group starts at its first eligible entry. Later entries must start before that window ends and do not extend it. Groups require at least two entries with matching project, task, description, billable state, tags, rates, type, and custom fields.

Collapse creates one replacement at the first original entry's start, with the exact sum of the grouped durations. After it confirms the replacement, collapse deletes that group's originals in bounded bulk requests. There is no option to zero the originals. A separate setting excludes invoiced entries and entries with unknown invoice status; this setting defaults to enabled.

Collapse and overlap repair are independent actions. Collapse permits overlaps, which users can repair afterward. Both actions plan from the cache and refresh Clockify entries and reports after writes, including partial failures. They do not update cached entries directly.

The collapse badge appears when cached entries qualify or an unfinished operation needs attention. Saved progress lets retries resume deletions without creating another replacement. An uncertain create response must be resolved from a later sync before deletion can continue.

## Local list behavior

Widgets read saved work and time data reactively. Display-filter and sorting changes retain the last result until the next read completes. GitHub also retains rows during page changes. Changes to account, workspace, or repository scope clear the previous result.

Local read failures remain visible with a retry action. Retained provider rows represent last-known data, not proof that every record was checked by the latest sync.
