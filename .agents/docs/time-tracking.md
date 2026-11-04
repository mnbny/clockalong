# Time tracking

The dashboard helps users find work, control Clockify timers, and review completed time. Source widgets combine work context with Clockify activity. Provider-specific filtering and sorting belong to each work source.

## Timer workflow

Users start timers from Linear issues, GitHub work items, or Quick Timer presets. The running item has an active treatment and a stop control. The Clockify widget provides a general stop control.

New source entries use the dashboard project override when present, otherwise the default project, plus the saved billable preference. Resuming an existing entry creates a new running entry from its trackable fields.

The Clockify widget shows the running timer and summary time and value for today, this week, and this month. Its recent-entry table offers one-, three-, and seven-day calendar ranges. Tracked value comes from Clockify rates; it is not an invoice or billing approval.

The app header owns manual tracking sync and its activity indicator. Individual widgets do not provide separate refresh buttons.

## Manual entry and editing

Right-clicking a source play control or Quick Timer card opens completed-time entry. Keyboard context-menu actions provide the same access. Left-click retains the normal timer action.

The manual form accepts fractional minutes and editable start and end times. New entries end at the time the form opens; changing duration moves the start backward. When editing an existing entry, changing duration keeps the start and moves the end.

Completed entry creation leaves the running timer unchanged. Overlaps are permitted. Provider entries keep their configured descriptions and internal references; copies of existing entries retain their trackable fields.

Successful writes update the local cache when the response identifies the entry, then refresh entries and reports. Stopping a timer makes its completed activity available for source summaries and ordering.

## Overlap review

Overlap detection uses completed cached entries and ignores running timers. Its review buckets are today, the preceding six days, and days seven through twenty-seven ago. These buckets are separate from calendar report periods.

An overlap badge opens a preview of dated before-and-after ranges. Repair preserves durations and moves overlapping entries forward while retaining entries that need no adjustment.

Repairs use sequential bounded batches for one Clockify user and workspace. Rate-limit retries retain the previewed timestamps. Each response must confirm the batch before the next one proceeds.

Partial success remains saved. A failed request is not proof that no entries changed. After either success or failure, the app refreshes entries and reports before another review.

## Local list behavior

Widgets read saved work and time data reactively. Display-filter and sorting changes retain the last result until the next read completes. GitHub also retains rows during page changes. Changes to account, workspace, or repository scope clear the previous result.

Local read failures remain visible with a retry action. Retained provider rows represent last-known data, not proof that every record was checked by the latest sync.
