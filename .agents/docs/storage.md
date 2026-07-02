# Storage

Frontend settings use `src/services/storage/`.

The storage service wraps `@tauri-apps/plugin-store` and falls back to defaults outside Tauri so the app can render in browser-based Vite development. Keep stored values small, serializable, and versioned when changing shape.

## Keys

- `compactRows`: temporary preference for dense list and table views.
- `clockifyBillable`: default billable flag for new Clockify time entries created from Linear issues.
- `clockifyDefaultProject`: default Clockify project for new time entries created from Linear issues. Stores the selected workspace/project IDs plus display names.
- `clockifyDescriptionTemplate`: Clockify time-entry description format for Linear issue variables.
- `clockifyDescriptionTemplateFallback`: replacement text for missing values in the Clockify description template.
- `clockifyEntrySyncDays`: number of recent Clockify entry days to sync into the local Clockify entry cache. Values are `5`, `15`, and `30`. Default is `30`.
- `clockifyEntrySyncInterval`: how often recent Clockify entries sync in the background. Values are `manual`, `5m`, `15m`, `30m`, and `1h`. Default is `30m`.
- `clockifyQuickTimerEntryLinks`: local mapping from Clockify time entry IDs to Quick Timer preset IDs and submitted template values.
- `defaultView`: temporary landing view preference for the app shell.
- `density`: temporary numeric UI density value.
- `desktopAlerts`: temporary preference for desktop notifications.
- `displayName`: temporary local display name used by settings UI previews.
- `linearTicketSyncLimit`: maximum number of assigned Linear tickets to sync for ticket lists. Default is `50`.
- `linearTicketSyncInterval`: how often assigned Linear tickets sync in the background. Default is `30m`.
- `linearTicketSyncOrderBy`: Linear pagination ordering field for ticket sync. Values mirror Linear `PaginationOrderBy` support currently exposed by the app: `createdAt`, `updatedAt`.
- `linearTicketSortOrder`: client-side ticket ordering mode. Values are `custom`, `status`, `created`, `updated`, and `alphabetical`.
- `quickTimersColumns`: number of Quick Timer columns to show in the dashboard grid. Default is `6`.
- `quickTimersEnabled`: whether the Quick Timers dashboard feature is enabled. Default is `true`.
- `quickTimers`: saved ad hoc Quick Timer presets.
- `quickTimersCache`: last submitted template variable values per Quick Timer preset.
- `theme`: active daisyUI theme and native window appearance.
- `refreshInterval`: temporary background refresh preference.

## Native secrets

Clockify stores the user API key in native Stronghold storage, not in the Tauri JSON store. Linear stores OAuth token data in Stronghold as well. On startup, Rust reads those saved credentials and validates or refreshes them before setting provider auth state.

## Local Clockify entry cache

Recent Clockify time entries are persisted by TanStack DB through browser localStorage under `clockalong.clockify.timeEntries.v1`. This cache is not a Tauri store key and does not contain provider credentials. Treat it as a local read model for recent entry-level UI, rebuilt by `ClockifySyncProvider` from Clockify's API.

## Local Linear ticket cache

Assigned Linear ticket rows are persisted by TanStack DB through browser localStorage under `clockalong.linear.tickets.v1`. This cache is not a Tauri store key and does not contain provider credentials. Treat it as a local read model for compact ticket-list UI, rebuilt by `LinearSyncProvider` from Linear's API.
