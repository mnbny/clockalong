# Storage

Clockalong separates preferences, secrets, provider data, and image bytes by ownership.

- The native Tauri store holds small, versioned settings, including Quick Timer presets, SVG icons, and Paseo trigger definitions.
- Stronghold holds Clockify and GitHub credentials, Linear tokens, and the Telegram session and private group reference.
- Dexie manages IndexedDB for Clockify entries, collapse progress, Linear issues, GitHub work items, Telegram notifications, and Paseo execution records.
- TanStack Query holds remote request state and scoped memory caches.
- A bounded native cache holds Telegram image bytes.

Browser preview uses settings defaults. Provider caches remain subject to browser-origin quota and eviction. Settings and credentials are not bulk browser caches.

## Settings transfer

Export downloads the raw settings snapshot. Import applies only supported settings and leaves missing values unchanged. It ignores metadata, unknown keys, the notification snooze deadline, and the active Quick Timer association.

Reset first exports the same snapshot, then clears supported settings. It preserves credentials, provider caches, notification records, snooze state, and the active Quick Timer association.

Quick Timer presets and saved form values can be restored. The raw export can contain temporary local state, but import does not restore that state. Secrets, notification records, and provider caches are outside settings backups.

Collapse duration, chunk size, and invoice exclusion settings participate in settings transfer and reset. Operation progress remains outside settings backups.

Paseo triggers import disabled, with fresh revisions and no active message boundary. Reset removes trigger definitions but preserves execution records. Execution records are outside settings backups.

## Paseo execution records

An automatic execution identity combines its trigger, Telegram scope, and message ID. The saved record prevents repeated delivery or collection from creating another automatic attempt within the same database.

Pending records retain the resolved prompt and project and agent selections. The dispatcher claims each record before execution and checks current trigger settings. Terminal records discard launch inputs and retain status, source identity, and any returned agent ID.

When a command result is uncertain, its record remains unconfirmed and does not automatically retry. Separate installations and development origins do not share these records. Confirmed sample runs appear in app logs and do not enter the automatic execution queue.

## Provider data

Persist compact fields that the app uses, not raw SDK or provider responses. Database indexes support scoped reads and source-reference matching.

A complete provider fetch commits its applicable updates and deletions in one transaction. Partial or failed pagination cannot reconcile the cache. Provider-specific briefs define fetch scope and retained-record behavior.

Dexie owns schema upgrades and live subscriptions. Upgrade failure rolls back the upgrade transaction. Local read errors expose retry; retry reopens the database before repeating the read.

Clockify rows belong to a user and workspace. Linear rows belong to a verified viewer. GitHub reads apply selected repositories and enabled types. Tracking-provider disconnect clears its cached rows and invalidates in-flight writes.

## Clockify collapse progress

Collapse progress belongs to a user and workspace and persists independently of the entry cache. It records planned groups, replacement identities, and confirmed deletions. It survives disconnect so a returning account can resume an unfinished operation.

An unconfirmed create remains pending until synced entries identify one replacement. Retries do not blindly repeat that create. After an uncertain bulk deletion response, a complete sync can confirm which originals are absent. Retries skip confirmed deletions. A completed operation is removed only after the final refresh succeeds. Separate installations and development origins do not share this progress.

## Telegram records

Notification records retain message content, sender data, topic labels, timestamps, attachment metadata, and local clear state. Identity includes account, group kind, group ID, and message ID.

Cleared identities and the collection checkpoint survive restarts. Unlink and disconnect retain notification records, but only the selected account and group can display them. The checkpoint tracks collection progress independently of clear state.

Records exclude credentials, private access hashes, whole SDK messages, and transfer references. They are outside settings backups and MCP snapshots.

The snooze deadline is a local settings timestamp. Expired timestamps are inactive. Import and reset preserve it.

Conversation records and transfer references use connection-scoped memory. The service retains recent notification records for image retrieval. Scope teardown cancels operations and discards memory; late results cannot restore it. Send inputs last only for their request.

## Telegram image cache

Avatars, previews, and full images survive restarts for the same account and group. The cache stores bytes without messages, credentials, or transfer references.

The shared budget is 64 MiB and 1,024 images. Avatars and previews are limited to 512 KiB each; full images to 20 MiB. Eviction removes the least recently used images. Rust owns paths and restricts filesystem permissions.

Saved avatars and previews can render before network restoration. Cache misses and failures permit downloads. Unused full-image memory entries expire after 30 seconds; disk copies remain within the shared budget.

Account or group changes discard the previous image cache. Unlink, disconnect, and invalid-session cleanup remove images and invalidate access handles. Late downloads cannot restore removed images. Normal teardown retains completed cache entries.
