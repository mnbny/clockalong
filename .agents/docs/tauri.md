# Tauri

Tauri owns the desktop window, native state, filesystem boundaries, and platform integrations. The frontend reaches these capabilities through typed domain clients.

## Native state

Rust publishes canonical native state through snapshot commands and change events. Shared frontend hooks subscribe before reading the snapshot, so a late initial result cannot overwrite a newer event.

Hooks expose typed state, clean up listeners, and provide browser fallbacks. Payloads use serializable data with frontend-compatible field names.

Authentication initialization and provider connection rules belong to the authentication domain.

## Appearance and window lifetime

The saved theme is applied before React renders. The window remains hidden until the themed shell mounts. Theme changes update the palette and native light or dark appearance together.

The header and App settings share the theme selection. Bundled daisyUI themes are grouped by appearance, with Halloween as the fallback.

On macOS, closing the main window hides it rather than ending the process. The Dock restores it. The native Quit action exits the app.

The optional menu-bar item shows timer state and provides timer actions. Recent choices come from completed cached entries, with one entry per displayed title. Hiding the window keeps background services available.

## Native files

Telegram image caching uses bounded binary IPC. Rust chooses cache paths, enforces limits, and invalidates scoped handles. Frontend callers cannot choose arbitrary cache paths.

MCP attachment reads are a separate boundary. Rust retains the absolute path only for a pending send. The frontend receives a filename and can claim bytes once through that request.

Attachment reads accept nonempty regular files up to 20 MiB and run off the main thread. Completed or expired requests cannot claim bytes. This reader does not grant general frontend filesystem access.

## Update experience

The root checks for updates after launch and every 30 minutes. App settings also provides a manual check.

Update-available and restart notifications remain visible until manually dismissed. This applies to automatic and manual update checks.

Available updates produce an install action. Installation and restart require user actions; active time tracking does not trigger an automatic restart. Distribution owns release artifacts and updater signing.
