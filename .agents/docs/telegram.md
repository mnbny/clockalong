# Telegram

## Scope

Telegram is an optional account connection for conversations in one selected group. It supports login, session restore, group connection, and conversation services. Clockify remains the only app-level authentication requirement.

The conversation services provide history, topics, realtime updates, unread data, text replies, and single-file transfers. The chat interface and attachment picker are separate work. Downloads save to the system Downloads folder by default. Users need an existing Telegram account and the official Telegram phone app.

## Ownership

One private frontend service owns the MTProto client and serializes account and group changes. A thin provider owns the service above routes. Sign-in and Settings share a compact authentication dialog. Conversation reads and transfers do not acquire the login operation guard.

The frontend uses mtcute for authentication, session validation, and realtime updates. The client uses memory storage. SDK synchronization can read account-wide updates; Clockalong filters these before they reach selected-group caches. Components receive scoped operations and compact data, without direct access to the client or saved session.

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

Basic groups and supergroups with or without topics are supported. Broadcast channels, gigagroups, monoforums, and inaccessible groups are rejected. A migrated basic group must be unlinked and connected again with its current invite link. Verification refreshes the title and whether the group has topics. Topic and message UI remain outside this feature.

Rust stores one group reference bound to the account in Stronghold, including private access data for supergroups. The provider exposes group identity, verification state, and scoped conversation operations. Invite links are temporary input and are not stored. Group data stays outside Settings backups, browser storage, and logs.

After account restore succeeds, the service verifies the saved group. Group failure keeps the selection for Retry and does not disconnect the account. Saved identity remains visible when account restore fails so Unlink works offline. Unlink removes only the local selection; it never leaves the Telegram group. If removal fails, conversation work stays stopped and the saved selection remains available for Retry or Unlink.

Disconnect, invalid-session cleanup, and fresh QR authorization clear the group. An absent saved session also clears any orphan selection. A new authorization cannot reuse the old access data, even for the same account. Normal teardown retains both records. The existing operation guard serializes verification, saves, and removals. Results discarded after teardown cannot start a group save.

## Conversation data

TanStack Query owns history pages, topic pages, group summaries, and small avatars and previews in memory. Each account and group connection has a separate scope. Clockalong does not add a server, database, or persistent chat cache. Local state holds operation controls and temporary object URLs.

Basic groups and supergroups without topics have one conversation. Forum groups have separate topic histories, including General. History and topics support older-page cursors. Server counts remain separate from the number of loaded records.

Message records contain text, formatting entities, sender identity, reply context, and attachment metadata. Only selected-group records and their required transfer references enter the cache. Whole SDK message objects and their broader peer collections do not. References to replies outside the group do not trigger reads of other conversations.

Realtime updates reconcile new messages, edits, deletions, and read-state changes. Send responses and realtime echoes share message identity, so they do not create duplicate rows. A reconnect or detected update gap discards old pagination cursors and refreshes from the newest page. Temporary network failure can retain stale data; group access failure makes the connection unavailable until retry.

## Sends and unread state

The group and topic summaries expose Telegram's unread counts and read positions. Fetching history does not mark messages as read. A caller must explicitly acknowledge a known message in the selected conversation. Concurrent acknowledgments coalesce, confirmed read positions never decrease, and successful acknowledgments refresh the summary. They do not automatically clear mentions.

Text sends and single-file sends can reply within the same conversation. Each send operation has a stable identity for an explicit retry of unchanged input. Automatic retries and a persistent outbox are excluded. A cancellation after the final send request can have an unknown outcome; it does not prove Telegram rejected the message.

Cached permissions help reject restricted actions before a request. Telegram remains authoritative when permissions change. Failures expose fixed categories, including restrictions and wait periods, without raw provider errors or content.

## Attachments

Uploads accept one selected File or Blob per send, with progress and cancellation. Media mode uses supported photos and videos with verified compatibility metadata. Original mode sends the supplied file as a document. An unprobed or unsupported video uses the document path. Media mode does not promise local compression or video transcoding.

Upload limits follow Telegram's account configuration within the installed SDK's supported limits. Full downloads stream to a writable destination with bounded buffering and respect destination backpressure. The service does not assemble large files in the Query cache. Expired file references permit one scoped refresh and retry for the same attachment. Protected and ephemeral attachments are not downloadable.

Downloads stream through a narrow native writer into the system Downloads folder. Rust restricts remote names to safe filenames and adds a number when a name already exists. It never overwrites an existing file. Only a complete transfer becomes a finished file. Cancellation, transfer failure, group teardown, and normal app exit remove partial downloads. Completed downloads remain on disk after unlink or disconnect.

The native writer accepts bounded binary chunks and runs file work off the main thread. It does not grant the frontend general filesystem access or accept arbitrary destination paths. Abrupt termination can leave a hidden partial file. A filesystem without hard-link support cannot publish a download through this writer.

Small avatars and attachment previews have bounded downloads. Consumers own temporary object URLs, which are revoked on cleanup or scope cancellation. The installed SDK cannot download files that require its unsupported CDN redirect path.

## App configuration

The native build receives the Telegram app ID and hash from its environment. The development launcher loads local development configuration automatically; exported values take precedence. The normal release launcher loads local production configuration, with exported values taking precedence. Development files are excluded from release configuration.

Cargo embeds both values and rebuilds when they change. Packaged apps launched from Finder need no environment configuration. Missing app configuration disables only Telegram.

Bundled app values remain extractable. They identify Clockalong; each user separately authorizes an account. The user session is the account credential and stays outside settings backups and browser persistence. Protocol logging is disabled, and UI errors contain fixed safe messages.

## Supported use

Use one Telegram-enabled Clockalong instance. Auth development requires a full restart. Concurrent instances that share a session can invalidate it.

The MVP excludes phone/code login, password recovery, cross-process coordination, and seamless hot reload. Browser preview renders a disconnected fallback and explains that login requires the desktop app.

Albums, message search, reactions, typing indicators, topic administration, and rich media presentation are outside the conversation services.
