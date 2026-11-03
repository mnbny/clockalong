# Logging

Native logs and forwarded frontend console output share the app's diagnostic log. Rust owns the file. Typed native commands provide read and clear access without broad frontend filesystem permissions.

The log rotates at 5 MB and retains four rotated files. App settings reads only the current file.

## Diagnostic content

Use stable domain prefixes and operational summaries: request outcomes, page counts, sync ranges, cache counts, and lifecycle state. Credentials and authorization headers never belong in logs.

Clockify diagnostics can include entry identifiers, timestamps, user and workspace identifiers, and short descriptions needed for sync and source matching. Bulk responses are summarized rather than logged in full.

Linear diagnostics exclude issue titles, descriptions, and assignee names. MCP diagnostics exclude arguments, snapshots, template values, and provider content.

Telegram protocol logging is disabled. Telegram logs and errors exclude message text, attachment names, local paths, raw provider errors, and private account or group data. Sessions, QR tokens, passwords, invite links, and access hashes are credentials.

Frontend console output reaches the native file, so these restrictions apply on both sides of the bridge.

## Settings viewer

App settings opens a log drawer and loads contents on demand. Users can refresh, copy, download, or clear the current log.

The displayed view includes native app logs and recognized frontend prefixes. Downloads use that filtered view. Prefix registration and diagnostic messages must stay aligned so relevant messages remain visible.
