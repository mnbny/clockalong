# Logging

Clinear follows the Streamlink Tauri logging pattern. Rust logs and forwarded browser console logs land in the same app
log file, and the settings screen reads that file for diagnostics.

## Ownership

- Rust owns the physical app log file.
- Vite/browser code forwards console output into Tauri's log plugin.
- The frontend reads and clears logs only through typed Tauri commands.
- Do not add broad frontend filesystem access for diagnostics.

## Rust

- Use `tauri-plugin-log` as the logging backend.
- Configure a `LogDir` target named `app`.
- Keep the log filename centralized through `APP_LOG_FILE_NAME`.
- Use normal Rust logging macros such as `log::info!`, `log::warn!`, and `log::error!`.
- Keep sensitive values out of logs. For credentials, log presence, status, and length only when useful.

The app exposes two narrow commands for diagnostics UI:

- `app_read_log_file`: returns the current app log contents, or an empty string if the file does not exist yet.
- `app_clear_log_file`: truncates the current app log file, treating a missing file as success.

## Frontend

- Initialize console forwarding once from the frontend entrypoint before React renders.
- Console forwarding lives in `src/utils/console-logging.ts`.
- Use `console.info`, `console.warn`, `console.error`, or `console.debug` with a stable bracketed prefix for logs that
  belong in the settings drawer.
- Provider bridge helpers should log safe lifecycle messages, not credential values.
- Clockify API request logs use `[clockify api]` and should include endpoint, query params, and sanitized report/body
  fields only. Do not log API keys or raw response bodies.
- The app log hook should read logs through the typed Tauri app client.

## Frontend prefixes

- `[linear tickets]`: Linear ticket fetch and client-side ordering diagnostics. Log request parameters, page counts,
  aggregate counts, cursor presence, state-type counts, linked-ticket counts, and top identifiers. Do not log issue
  titles, descriptions, assignee names, or credential values.
- `[clockify api]`: Clockify REST request diagnostics. Keep request bodies summarized and scrubbed to operational fields.
  Time-tracking lifecycle and ticket-summary diagnostics use the same prefix with subphrases such as `timer ...` and
  `ticket summaries ...`.

## Settings UI

The settings screen owns the user-facing log viewer. Keep the Streamlink drawer pattern:

- open logs in an end-side drawer
- read logs lazily when the drawer opens
- support copy, refresh, and clear actions
- show success and error states through toasts
- filter noisy lines so the drawer shows Rust app logs and known frontend prefixes

When adding a new frontend log prefix that should appear in the drawer, add it to the settings log filter.
