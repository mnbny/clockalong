# MCP server

Clockalong exposes local agent tools for tracking context, Clockify timer control, completed time entry, overlap repair, entry collapse, and Telegram sends. The server is disabled by default and runs only while enabled in App settings and the app process remains alive.

## Public capabilities

- Work discovery lists Linear issues, GitHub issues and pull requests, and Quick Timer presets with tracked totals.
- Refresh synchronizes tracking data without listing work.
- Tracking status, recent completed entries, and project listings provide cached Clockify context.
- Timer actions start work from a listed item or stop the running timer.
- Completed-time entry adds time for a listed item without changing the running timer.
- Overlap repair uses the dashboard's current-month operation for the active Clockify workspace, across all projects.
- Entry collapse uses the dashboard's current-month operation and saved duration, chunk size, and invoice exclusion settings.
- Telegram discovery lists the selected group and visible topics.
- Telegram send delivers plain text, one local file, or a file with a caption to a discovered destination.

Public tool names and arguments are a consumer contract. Protocol schemas, validation, and frontend command handling must agree.

The server does not expose credentials, raw provider APIs, arbitrary-description timers, manual entry editing or resuming, Telegram history, resources, or prompts.

Completed entries use a positive duration, including fractional minutes, and an optional end time with an explicit timezone. Overlaps are allowed. Source templates preserve internal references, selected projects, billable preferences, and Quick Timer values.

Overlap repair takes no arguments and needs no selected timer project. It returns the number of changed entries and whether the final display refresh failed. A month without overlaps succeeds with zero changes. Matching concurrent requests share the active repair.

Entry collapse also takes no arguments and needs no selected timer project. It returns counts of created replacements and deleted originals, plus final refresh failure status. A month without eligible groups succeeds with zero changes. Matching concurrent requests share the active collapse. Interrupted deletions resume from saved progress.

Both actions plan from the local cache and sync afterward. Collapse permits overlaps and does not invoke repair. Callers request the two actions separately.

## Read and refresh ownership

Rust owns the loopback listener, protocol validation, cached snapshots, and pending commands. The webview publishes normalized tracking context and performs provider operations through existing services.

Snapshots contain bounded recent entries and tracking state, not entire work-item archives. Linear and GitHub listings read bounded database results in the active webview. A hidden window remains available.

Work discovery refreshes by default and can explicitly use cached data. Refresh shares the header's synchronization action, including requests already in progress. It publishes updated context before reporting success.

Provider failures, offline pauses, and publication failures return errors rather than presenting cached data as fresh. Manual sync settings still permit explicit refresh.

Entry sync can succeed when invoice status is unavailable. Collapse excludes entries with unknown status while invoice protection is enabled.

Repository choices, provider fetch limits, and list filters continue to apply. The snapshot capture time records assembly, not the last successful provider fetch. List reads check data revisions and scope to avoid combining incompatible results.

Refresh, overlap repair, entry collapse, and Telegram sends have two-minute native deadlines. Other bridged commands use 30 seconds. A repair or collapse timeout can leave saved changes and an active operation.

## Telegram and files

Telegram tools require a connected account and verified group, independently of Clockify authentication. Unavailable connections fail immediately rather than waiting for reconnection.

Discovery excludes hidden topics and never reads history or marks messages read. Sends require a still-valid discovered group and topic. An unavailable topic cannot fall back to another destination.

Attachments use an absolute local path on the machine running Clockalong. The native reader accepts one nonempty regular file up to 20 MiB. The webview claims its bytes once through the pending request; it does not receive arbitrary filesystem access.

Cancellation or timeout can leave Telegram delivery unconfirmed, so callers must check before retrying. There is no automatic resend or persistent outbox.

## Local trust boundary

The listener binds only to IPv4 loopback and has no token authentication. Enabling it trusts local callers with tracking actions and selected-group Telegram sends, including readable local files.

Non-loopback browser origins are rejected. This check is not caller authentication and does not make network exposure safe.

Each instance selects the first available port from its configured pool, or uses an explicit environment override. Settings shows the bound port and registration commands for Claude Code and Codex.

A registered consumer reaches the instance on that port; registration does not follow another instance automatically. Disabling the server or exiting the app stops the listener.

Snapshots, responses, and logs exclude credentials and unnecessary provider data. Telegram errors also exclude message content, private group data, and local file paths.
