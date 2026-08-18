# MCP server

Clockalong exposes a local Model Context Protocol server for agents that need time-tracking context or timer control. Clockalong runs the server only while the app runs and the user enables it in App settings.

## Scope

The server exposes six tools:

- `list_trackable_work` returns available Linear tickets, GitHub issues and pull requests, and Quick Timer presets with local tracked totals.
- `get_tracking_status` returns provider connections, the active Clockify project, tracked summaries, and the running timer.
- `list_recent_entries` returns completed entries from the local Clockify cache for the requested calendar-day bucket.
- `list_clockify_projects` returns cached projects from the selected Clockify workspace.
- `start_timer` starts a Clockify timer for a listed work item.
- `stop_timer` stops the current Clockify timer.

Tool names and argument names form a public contract with registered consumers. Do not rename them casually. Keep the Rust catalog, protocol validation, and webview command types aligned when the contract changes.

The server does not expose provider credentials, raw provider APIs, MCP resources, prompts, logging, or completions. It does not support resuming or editing entries, or starting a timer from an arbitrary description. Starts use existing provider templates so descriptions retain Clockalong internal references and continue to match tracked totals.

## Ownership

Rust owns the loopback listener and server status. It validates HTTP and MCP requests. It caches snapshots and owns read responses and pending write requests. The webview normalizes and publishes snapshots. It owns all Clockify writes. It reuses the same provider timer behavior, settings, local caches, and query refreshes as the dashboard.

The webview publishes one normalized snapshot when relevant cached data or settings change. Read tools use that snapshot and never fetch a provider. The snapshot contains only the data in existing frontend caches, so its freshness follows the app's normal sync intervals.

Write tools cross the bridge as an event with a request identifier, tool name, and validated arguments. The webview completes the request after Clockify changes the timer. Rust waits up to 30 seconds and converts webview failures into MCP tool errors.

## Lifecycle and ports

The server is opt-in. Clockalong disables it by default. Rust reads the stored preference during app startup. Clockalong starts or stops the listener when the user changes the setting. The listener ends when the app process exits.

Each running instance binds one loopback port. Clockalong checks the ordered pool from 53700 through 53703. It uses the first free port. The `CLOCKALONG_MCP_PORT` environment value replaces the pool with one port. App settings displays the actual bound port.

When several instances run, each takes the next free port. A consumer registered for port 53700 reaches the instance that acquired the primary port first. It does not automatically follow another instance.

## Security boundary

The listener binds only to `127.0.0.1` and has no token or authentication step. Clockalong trusts every local process that can reach the port. It rejects requests with a non-loopback Origin, but this check does not replace authentication. Do not expose the listener beyond the local machine. Do not place credentials or unnecessary provider fields in snapshots or logs.
