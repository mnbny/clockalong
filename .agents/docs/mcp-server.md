# MCP server

Clockalong exposes a local Model Context Protocol server for agents that need tracking context, timer control, or manual time entry. Clockalong runs the server only while the app runs and the user enables it in App settings.

## Scope

The server exposes eight tools:

- `list_trackable_work` syncs connected providers. It returns available Linear tickets, GitHub issues and pull requests, and Quick Timer presets with tracked totals. Set `refresh` to false to use the cached snapshot.
- `refresh` runs the full app sync without listing work. It returns the synced data groups and the snapshot capture time.
- `get_tracking_status` returns provider connections, the active Clockify project, tracked summaries, and the running timer.
- `list_recent_entries` returns completed entries from the local Clockify cache for the requested calendar-day bucket.
- `list_clockify_projects` returns cached projects from the selected Clockify workspace.
- `start_timer` starts a Clockify timer for a listed work item.
- `add_time_entry` adds completed Clockify time for a listed work item without changing the running timer.
- `stop_timer` stops the current Clockify timer.

Tool names and argument names form a public contract with registered consumers. Do not rename them casually. Keep the Rust catalog, protocol validation, and webview command types aligned when the contract changes.

The server does not expose provider credentials, raw provider APIs, MCP resources, prompts, logging, or completions. It does not support resuming or editing entries, or starting a timer from an arbitrary description. Both entry-creation tools use the existing provider templates so descriptions retain Clockalong internal references and continue to match tracked totals.

Manual time entry requires a listed source and item ID, plus a positive duration in minutes. Fractional minutes are supported. An optional end timestamp, with an explicit timezone, supports backdated work. The end defaults to the current time. The start is calculated from the duration. Overlaps are allowed.

Quick Timer entries accept template variables and use saved values for omitted variables. Manual entry saves the submitted values but preserves the active Quick Timer association. Entries use the selected Clockify project and billable preference. The result includes the created entry ID, description, start, end, duration, project name, and billable flag.

## Ownership

Rust owns the loopback listener and server status. It validates HTTP and MCP requests. It caches snapshots and owns read responses and pending webview commands. The webview normalizes and publishes snapshots. It owns all Clockify writes. It reuses the same provider timer behavior, settings, local caches, and query refreshes as the dashboard.

The webview publishes one normalized snapshot when relevant cached data or settings change. Rust reads that snapshot to answer read tools. Tracking status, recent entries, projects, and cached work listings do not fetch provider data.

Refresh uses the same full sync as the app header. It refreshes Clockify entries, the running timer, and summaries, plus connected Linear and GitHub sources. Concurrent callers share the sync and reuse provider requests already in progress. Manual sync settings do not prevent an explicit refresh.

After connectivity returns, an explicit refresh restarts paused provider requests even when the app window remains hidden.

The webview reads the updated caches and publishes the snapshot before it completes a refresh request. A provider failure, an offline pause, or a publication failure returns an MCP tool error. A failed refresh does not return a cached work list as fresh data. Agents can request a cached list separately.

Repository selections, provider sync limits, and list filters still apply after refresh. The snapshot capture time records when the snapshot was assembled. It does not record the last successful fetch for each provider.

Timer changes, completed entries, and refresh requests cross the bridge as events. Each event carries a request identifier, tool name, and validated arguments. Rust waits up to 30 seconds for time-entry commands and two minutes for a full refresh. Webview failures become MCP tool errors. Refresh does not require a selected Clockify project. It does not change time entries or the running timer.

## Lifecycle and ports

The server is opt-in. Clockalong disables it by default. Rust reads the stored preference during app startup. Clockalong starts or stops the listener when the user changes the setting. The listener ends when the app process exits.

Each running instance binds one loopback port. Clockalong checks the ordered pool from 53700 through 53703. It uses the first free port. The `CLOCKALONG_MCP_PORT` environment value replaces the pool with one port. App settings displays the actual bound port.

After the listener binds, App settings provides separate registration commands for Claude Code and Codex.

When several instances run, each takes the next free port. A consumer registered for port 53700 reaches the instance that acquired the primary port first. It does not automatically follow another instance.

## Security boundary

The listener binds only to `127.0.0.1` and has no token or authentication step. Clockalong trusts every local process that can reach the port. It rejects requests with a non-loopback Origin, but this check does not replace authentication. Do not expose the listener beyond the local machine. Do not place credentials or unnecessary provider fields in snapshots or logs.
