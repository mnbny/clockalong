# Logging

Clockalong follows the Streamlink Tauri logging pattern. Rust logs and forwarded browser console logs land in the same app log file, and the App settings section reads that file for diagnostics.

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
- The app log file rotates at 5 MB and keeps four rotated files. The settings drawer reads only the current `app.log`.

The app exposes two narrow commands for diagnostics UI:

- `app_read_log_file`: returns the current app log contents, or an empty string if the file does not exist yet.
- `app_clear_log_file`: truncates the current app log file, treating a missing file as success.

## Frontend

- Initialize console forwarding once from the frontend entrypoint before React renders.
- Console forwarding lives in `src/lib/logging.ts`.
- Use `console.info`, `console.warn`, `console.error`, or `console.debug` with a stable bracketed prefix for logs that belong in the settings drawer.
- Provider bridge helpers should log safe lifecycle messages, not credential values.
- Clockify API logs use `[clockify api]` and should include endpoint, query params, status, and sanitized request/response summaries. Do not log API keys. Time-entry response summaries may include truncated descriptions, time-entry IDs, timestamps, user/workspace IDs, and internal-ref provider counts because those fields are needed to debug Clockify sync and matching issues.
- The app log hook should read logs through the typed Tauri app client.
- Clockify entry sync diagnostics use `[clockify sync]`. Log sync ranges, page counts, fetched/stored/skipped counts, insert/update counts, ref counts, and short entry samples. Do not log credentials.
- Widget diagnostics use scoped prefixes such as `[clockify widget]`, `[linear widget]`, and `[github widget]` to show what the local synced-entry live queries expose to each dashboard widget.

## Frontend prefixes

- `[linear tickets]`: Linear ticket fetch and client-side ordering diagnostics. Log request parameters, page counts, aggregate counts, cursor presence, state-type counts, linked-ticket counts, and top identifiers. Do not log issue titles, descriptions, assignee names, or credential values.
- `[clockify api]`: Clockify REST request and response diagnostics. Keep request bodies summarized and scrubbed to operational fields. Time-tracking lifecycle diagnostics use the same prefix with subphrases such as `timer ...`.
- `[clockify sync]`: Clockify time-entry sync diagnostics for API page counts, local collection writes, ref counts, and sync failures.
- `[clockify widget]`: Clockify dashboard diagnostics for the local synced-entry live queries and log drawer interactions.
- `[linear widget]`: Linear dashboard diagnostics for Clockify synced-entry inputs and computed summary counts.
- `[github widget]`: GitHub dashboard diagnostics for Clockify synced-entry inputs and computed summary counts.
- `[app updates]`: App-wide update hook diagnostics. Log lifecycle/error state only; do not log release manifest raw bodies or signature material.

## Settings UI

`src/components/AppSettings.tsx` owns the user-facing log viewer. Keep the Streamlink drawer pattern:

- open logs in an end-side drawer
- read logs lazily when the drawer opens
- support copy, download, refresh, and clear actions
- show success and error states through toasts
- filter noisy lines so the drawer shows Rust app logs and known frontend prefixes
- download the currently displayed filtered `app.log` contents as a text file

When adding a new frontend log prefix that should appear in the drawer, add it to the App settings log filter.
