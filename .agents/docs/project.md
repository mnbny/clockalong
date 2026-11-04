# Project

Clockalong is a desktop companion for personal time tracking in Clockify. It connects work context to timers and helps users review the resulting time entries.

Clockify is the system of record for time entries, projects, workspaces, and reports. Linear and GitHub supply trackable work. Quick Timers supply local presets. Telegram supplies group notifications and destinations for agent messages; it is not a time-tracking source.

## Product vocabulary

- Work source: an external provider or local preset that supplies trackable work.
- Work item: a Linear issue, GitHub issue or pull request, or Quick Timer preset.
- Internal reference: a stable marker in a Clockify description that identifies an external work item.
- Tracked value: an amount calculated from tracked time and a Clockify hourly rate.
- Notification: a retained incoming Telegram message with a local clear state.

## Product boundaries

The dashboard supports finding work, starting and stopping timers, adding completed time, and reviewing entries. Source context supplies descriptions and links without turning Clockalong into a project-management client.

Clockify is required for the tracking dashboard. Linear and GitHub are optional. Quick Timers need no external work-source connection. Telegram operates independently of Clockify authentication.

Tracked value supports billing review but is not an invoice or an approved billable amount. Clockalong does not provide invoicing or automated value-based reconciliation.
