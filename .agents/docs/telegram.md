# Telegram

## Scope

Telegram is an optional account connection for one selected group. Settings provides controls for account login, session retry, disconnect, and group connection. Users need an existing Telegram account and the official Telegram phone app.

The Dashboard header contains a Telegram icon button with no action or unread badge. There is no conversation interface, composer, attachment viewer, or download control. Account connection is available on the sign-in screen and in Settings. Group selection is available in Settings. Telegram account connection, saved sessions, and the local MCP tools work independently of Clockify authentication.

The optional MCP server lists destinations and sends text or one local file within the selected group. It exposes no other groups or message history. Existing history, realtime, message projection, avatar, and preview services remain available for a later notification feed. That feed is not implemented.

## Ownership

One private frontend service owns the MTProto client and serializes account and group changes. A provider owns the service above routes. The sign-in screen and Settings use the same QR/password authentication dialog. Reads and sends do not acquire the login operation guard.

The frontend uses mtcute for authentication, session validation, and realtime updates. The client uses memory storage. SDK synchronization can read account-wide updates; Clockalong filters these before they reach selected-group caches. Consumers receive scoped operations and compact data. They have no direct access to the client or saved session.

Rust owns durable session storage in Stronghold and the public connected flag. The native command layer delegates Telegram operations to its provider module. Components read the native auth snapshot; temporary dialog state is not a second authentication source.

## Connection

The user scans a locally rendered QR code from Telegram's Devices settings. The dialog replaces expired QR codes and requests the two-step verification password when required. Incorrect passwords permit another attempt. QR scanning alone does not confirm a connection: authorization and native session storage must both succeed.

The password prompt names the Telegram password and points to Telegram's Two-Step Verification settings. Login and connection controls show action instructions and errors without notices about unfinished features.

Cancel aborts the active attempt and clears temporary QR and password values. Late results cannot save a cancelled attempt. Cancellation is disabled during the short native save. A failed save triggers a bounded remote logout attempt and client cleanup.

## Session lifecycle

Restore starts after native initialization so the initial native snapshot cannot overwrite its result. Restore does not block app initialization or require Clockify authentication.

The service imports the saved session into a fresh memory client and validates it with an authenticated self lookup. It does not start interactive login during startup. Transient failures retain the session for Retry. Definite invalid or revoked sessions are removed.

Settings keeps Disconnect available after a failed restore. Disconnect removes the native session before attempting bounded remote logout. A failed local deletion remains an error. If remote logout cannot be confirmed, the user can terminate Clockalong in Telegram's Devices settings.

Normal teardown closes the client without deleting the saved session or logging out. Hiding the macOS window does not tear down the client.

Unlink, disconnect, revoked-session cleanup, and teardown immediately cancel conversation work and clear its cache scope. Late results cannot restore that scope. A revoked session blocks new login during native cleanup, and an old client cannot clear a newer connection.

## Selected group

Settings accepts an existing invite link for a group the signed-in account already belongs to. Both friends can use the same link with their own accounts. Group connection checks membership and fetches that group's metadata. It never joins groups or lists conversations.

Basic groups and supergroups with or without topics are supported. Broadcast channels, gigagroups, monoforums, and inaccessible groups are rejected. A migrated basic group must be unlinked and connected again with its current invite link. Verification refreshes the title and whether the group has topics.

Rust stores one group reference bound to the account in Stronghold, including private access data for supergroups. The provider exposes group identity, verification state, and scoped conversation operations. Invite links are temporary input and are not stored. Group data stays outside Settings backups, browser storage, and logs.

After account restore succeeds, the service verifies the saved group. Group failure keeps the selection for Retry and does not disconnect the account. Saved identity remains visible when account restore fails so Unlink works offline. Unlink removes only the local selection; it never leaves the Telegram group. If removal fails, conversation work stays stopped and the saved selection remains available for Retry or Unlink.

Disconnect, invalid-session cleanup, and fresh QR authorization clear the group. An absent saved session also clears any orphan selection. A new authorization cannot reuse the old access data, even for the same account. Normal teardown retains both records. The existing operation guard serializes verification, saves, and removals. Results discarded after teardown cannot start a group save.

## Scoped read services

History, topics, group summaries, and sender records use TanStack Query memory. Each account and group connection has a separate scope. Records contain text, incoming formatting entities, timestamps, sender identity, topic and reply identifiers, and attachment metadata. Only selected-group records and the references needed for avatars and previews enter the cache. Whole SDK message objects and unrelated account peers do not.

Basic groups and supergroups without topics have one conversation. Forum groups have separate topic histories, including General. History and topics support older-page cursors. Server counts remain separate from the number of loaded records. Reads do not mark messages as read or fetch reply excerpts from other conversations.

Realtime updates reconcile new messages, edits, deletions, sender changes, and metadata. Message identity prevents duplicate records. Newer edits and deletion records protect loaded histories from late send responses. For basic groups, a request retains only message IDs to identify deletions before the send response arrives. The service releases these IDs when the request settles.

Routine metadata refreshes retain existing pages until replacement data arrives. Reconnects and detected update gaps reset pagination cursors. Temporary network failure can retain stale data; group access failure makes the service unavailable until retry. Supergroup update subscriptions belong to the service lifetime.

No interface preloads history. Realtime reconciliation updates existing history queries; it does not create a notification inbox. Messages are not persisted across restarts. The service has no notification dismissal, clear state, or restart catch-up policy. Telegram read counters remain provider metadata, not local notification state.

## Agent sends

MCP discovery returns the selected group and its visible topics. Before a send, the service checks the current selection, topic, connection, and permissions. General and other topics keep their distinct destinations. An unavailable topic never falls back to General. Text and captions are plain text; agents cannot compose replies to individual messages.

Each send has a scoped operation identity. The service rejects duplicate execution while that send is in progress. Confirmed responses update existing read caches, including responses that arrive out of order, without creating local display rows. The service has no display queue. It does not retain failed attachment inputs or resend automatically. The SDK can wait or retry internally.

The service uses upload progress only to distinguish cancellation during upload from an uncertain final send.

Request deadlines and Telegram scope teardown cancel sends. Navigation, window hiding, and Clockify authentication do not control send lifetime. A cancellation or failure after the final request may have an unknown outcome. Agents must check Telegram before retrying. Success returns only group, topic, and message identifiers.

Permission checks reject known restrictions before a send. Telegram remains authoritative when permissions change. Errors use fixed categories, including restrictions and wait periods, without raw provider errors or content.

## Attachments and images

MCP accepts one absolute local file path through a bounded native reader. Files must be nonempty regular files of at most 20 MiB. Supported photos and locally playable MP4 videos default to media, with an optional plain-text caption. An explicit file option forces the original document path. Unsupported formats remain documents.

MP4 classification uses a browser decoder without playback. Failed or stalled probes use the document path. Media mode does not promise compression or video transcoding. Upload limits also follow Telegram's account configuration within the installed SDK's supported limits.

Read services fetch only bounded avatars and attachment previews. They preserve attachment metadata and incoming protection rules. Protected and ephemeral content has no downloadable preview. An expired image reference permits one scoped refresh and retry. The service cannot download, resume, save, or display full-size attachments.

Avatars and previews use a native disk cache before a download. Telegram image identity determines reuse; changed images use new entries. The cache survives restarts for the same account and group. It stores only image bytes, with limits of 512 KiB per image, 64 MiB total, and 1,024 images. Eviction removes the least recently used images. Cache failures permit normal downloads.

Unlink, disconnect, and revoked-session cleanup remove the image cache and invalidate active handles. Late downloads cannot restore removed entries. A different account or group cannot reuse the previous cache. Normal teardown retains it. The installed SDK cannot download files that require its unsupported CDN redirect path.

## App configuration

The native build receives the Telegram app ID and hash from its environment. The development launcher loads local development configuration automatically; exported values take precedence. The normal release launcher loads local production configuration, with exported values taking precedence. Development files are excluded from release configuration.

Cargo embeds both values and rebuilds when they change. Packaged apps launched from Finder need no environment configuration. Missing app configuration disables only Telegram.

Bundled app values remain extractable. They identify Clockalong; each user separately authorizes an account. The user session is the account credential and stays outside settings backups and browser persistence. Protocol logging is disabled, and UI errors contain fixed safe messages.

## Supported use

Use one Telegram-enabled Clockalong instance. Auth development requires a full restart. Concurrent instances that share a session can invalidate it.

The MVP excludes phone/code login, password recovery, cross-process coordination, and seamless hot reload. Browser preview renders a disconnected fallback and explains that login requires the desktop app.

Message search, reactions, typing indicators, topic administration, and notification UI are outside the current scope.
