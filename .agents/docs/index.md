# Agent documentation

- `project.md`: current product boundary and Clockify companion framing
- `time-tracking.md`: dashboard scope, work-source ordering, and time-tracking workflow decisions
- `quick-timers.md`: ad hoc Quick Timer presets, templates, cache, and Clockify entry links
- `architecture.md`: app architecture and commands
- `tauri.md`: Tauri state, events, and React hook conventions
- `logging.md`: Rust/frontend logging and diagnostics UI pattern
- `storage.md`: store key contract
- `authentication.md`: authentication ownership, screen behavior, and provider decisions
- `linear.md`: Linear API, SDK, OAuth, and client strategy
- `github.md`: GitHub provider auth, settings, sync, dashboard, and Clockify matching decisions
- `clockify.md`: Clockify API, auth, and client strategy
- `distribution.md`: macOS signing, notarization, release, and updater direction

## Documentation style

Docs are for discovery and non-obvious project patterns. Do not document details that are self-explanatory in code, easy to find with file search, or only describe the current implementation mechanically. Prefer high-level maps, ownership boundaries, cross-file contracts, and conventions that help future agents know where to look and what assumptions to preserve.
