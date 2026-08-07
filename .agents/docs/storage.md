# Storage

Frontend settings use `src/services/storage/`.

The storage service wraps `@tauri-apps/plugin-store` and falls back to defaults outside Tauri so the app can render in browser-based Vite development. Keep stored values small, serializable, and versioned when changing shape.

## Settings backup

The App settings section can download the raw `settings.json` snapshot and import it later. Import restores only the supported settings in the file. It ignores store metadata, unknown keys, and `quickTimersActiveEntry`; missing backup keys leave current settings unchanged.

The Reset action first downloads the same raw backup, then clears those supported settings. It does not affect credentials, synced caches, or `quickTimersActiveEntry`.

Backups include Quick Timer presets and their last-used template values. They do not include Stronghold credentials or the local Clockify, Linear, and GitHub caches. The active Quick Timer association stays local because it refers to a specific Clockify entry in a specific workspace.

## Keys

- `clockifyBillable`: default billable flag for new Clockify time entries created from Linear issues.
- `clockifyDefaultProject`: default Clockify project for new time entries created from Linear issues. Stores the selected workspace/project IDs plus display names.
- `clockifyDescriptionTemplate`: Clockify time-entry description format for Linear issue variables.
- `clockifyDescriptionTemplateFallback`: replacement text for missing values in the Clockify description template.
- `clockifyEntrySyncDays`: number of recent Clockify entry days to sync into the local Clockify entry cache. Values are `5`, `15`, and `30`. Default is `30`.
- `clockifyEntrySyncInterval`: how often recent Clockify entries sync in the background. Values are `manual`, `5m`, `15m`, `30m`, and `1h`. Default is `30m`.
- `githubSelectedRepositories`: GitHub repositories allowed to appear in GitHub dashboard surfaces. Stores compact repository snapshots.
- `githubVisibleWorkItemTypes`: GitHub item types allowed to appear in GitHub dashboard surfaces. Defaults to issues and pull requests.
- `githubWorkItemSyncLimit`: maximum number of GitHub issues or pull requests fetched per active repository. Default is `30`, capped at `100`.
- `githubSelectedAuthors`: persisted additional GitHub dashboard authors. Each entry stores `{ username, avatarUrl }`. The connected GitHub viewer is always included at runtime and is not stored in this array.
- `githubSelectedLabels`: persisted additive GitHub dashboard label filters. Each entry stores `{ name, color }`. Label names are matched across the selected repositories.
- `githubShowClosedWorkItems`: whether GitHub dashboard surfaces show closed synced GitHub work items. Defaults to `false`. Sync still stores closed pull requests.
- `githubIssueDescriptionTemplate`: Clockify time-entry description format for GitHub issue variables.
- `githubIssueDescriptionTemplateFallback`: replacement text for missing values in the GitHub issue description template.
- `githubPullRequestDescriptionTemplate`: Clockify time-entry description format for GitHub pull request variables.
- `githubPullRequestDescriptionTemplateFallback`: replacement text for missing values in the GitHub pull request description template.
- `linearTicketSyncLimit`: maximum number of assigned Linear tickets to sync for ticket lists. Default is `50`.
- `linearTicketSyncInterval`: how often assigned Linear tickets sync in the background. Default is `30m`.
- `linearTicketSyncOrderBy`: Linear pagination ordering field for ticket sync. Values mirror Linear `PaginationOrderBy` support currently exposed by the app: `createdAt`, `updatedAt`.
- `linearTicketSortOrder`: client-side ticket ordering mode. Values are `custom`, `status`, `created`, `updated`, and `alphabetical`.
- `quickTimersColumns`: number of Quick Timer columns to show in the dashboard grid. Default is `5`.
- `quickTimersEnabled`: whether the Quick Timers dashboard feature is enabled. Default is `true`.
- `quickTimers`: saved ad hoc Quick Timer presets.
- `quickTimersActiveEntry`: local association between the active Quick Timer preset and its Clockify entry.
- `quickTimersCache`: last submitted template variable values per Quick Timer preset.
- `theme`: active daisyUI theme and native window appearance.

## Native secrets

Clockify stores the user API key in native Stronghold storage, not in the Tauri JSON store. Linear stores OAuth token data in Stronghold as well. On startup, Rust reads those saved credentials and validates or refreshes them before setting provider auth state.

## Local Clockify entry cache

Recent Clockify time entries are persisted by TanStack DB through browser localStorage under `clockalong.clockify.timeEntries.v1`. This cache is not a Tauri store key and does not contain provider credentials. Treat it as a local read model for recent entry-level UI, rebuilt by `ClockifySyncProvider` from Clockify's API.

Clear this cache on Clockify disconnect. Clockify user and workspace identity can change when the user rotates API keys, so the app should not keep showing the previous user's synced entries while the new key is loading.

## Local Linear ticket cache

Assigned Linear ticket rows are persisted by TanStack DB through browser localStorage under `clockalong.linear.tickets.v1`. This cache is not a Tauri store key and does not contain provider credentials. Treat it as a local read model for compact ticket-list UI, rebuilt by `LinearSyncProvider` from Linear's API.

## Local GitHub work-item cache

GitHub issue and pull request rows are persisted by TanStack DB through browser localStorage under `clockalong.github.workItems.v1`. This cache is not a Tauri store key and does not contain provider credentials. Treat it as a local read model for GitHub dashboard surfaces, rebuilt by `GithubSyncProvider` from GitHub's API according to the selected repositories, enabled work-item types, and fetch limit. Author and label selection, the transient `Show all` override, and closed-item visibility affect dashboard display only. They do not change sync filters. Persisted author and label selections may refer to values absent from the current cache so they can become active again when new work items arrive.
