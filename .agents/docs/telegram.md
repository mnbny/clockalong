# Telegram

## Scope

Telegram is an optional account connection for conversations in one selected group. It supports login, session restore, group connection, and conversation services. Clockify remains the only app-level authentication requirement.

Dashboard chat provides history, topics, realtime updates, unread counts, replies, and single-file transfers. Full-size images and videos open in a media dialog. Downloads save to the system Downloads folder. Users need an existing Telegram account and the official Telegram phone app.

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

Basic groups and supergroups with or without topics are supported. Broadcast channels, gigagroups, monoforums, and inaccessible groups are rejected. A migrated basic group must be unlinked and connected again with its current invite link. Verification refreshes the title and whether the group has topics.

Rust stores one group reference bound to the account in Stronghold, including private access data for supergroups. The provider exposes group identity, verification state, and scoped conversation operations. Invite links are temporary input and are not stored. Group data stays outside Settings backups, browser storage, and logs.

After account restore succeeds, the service verifies the saved group. Group failure keeps the selection for Retry and does not disconnect the account. Saved identity remains visible when account restore fails so Unlink works offline. Unlink removes only the local selection; it never leaves the Telegram group. If removal fails, conversation work stays stopped and the saved selection remains available for Retry or Unlink.

Disconnect, invalid-session cleanup, and fresh QR authorization clear the group. An absent saved session also clears any orphan selection. A new authorization cannot reuse the old access data, even for the same account. Normal teardown retains both records. The existing operation guard serializes verification, saves, and removals. Results discarded after teardown cannot start a group save.

## Chat interface

A Telegram button in the Dashboard header opens a drawer for the verified group. For forums, the badge totals Telegram's unread counts for visible topics after all topics load. Groups without topics use the group unread count.

The drawer follows App Logs for transitions, spacing, and header controls. It blocks background interaction and contains keyboard focus. Closing the drawer releases conversation observers after the slide transition. Temporary transport failure keeps cached conversations visible but disables new sends. Leaving Dashboard closes the drawer and media dialog.

Forum groups show topics in server order. Dashboard automatically loads all topics and preloads the first message page for each visible topic into TanStack Query. Preloading reuses cached history and sends one request at a time. The sidebar shows all topics and scrolls independently. Older message pages load when the user scrolls.

Chat selects the remembered valid topic or the first visible topic. A partial topic list does not prove deletion. A scoped lookup checks a remembered topic that is absent from loaded pages. Groups without topics open their only conversation. Closed topics remain readable; Telegram permissions control sends.

Topic selection and per-topic drafts stay in memory across drawer closure and Settings visits. Drafts contain text, a reply ID, and at most one file. A new chat scope or departure from the authenticated layout clears this state. Every drawer opening and topic switch starts at the latest messages. While the drawer stays open, older-page loads and media resizing preserve the reading position.

Message rows show authors, timestamps, reply excerpts, received formatting, and attachment metadata. Reply excerpts appear only for actual message replies. Topic membership does not create a reply preview or trigger a reply lookup. Formatting uses Telegram UTF-16 entity offsets and escaped React text. Unsupported entities preserve source text. Spoilers require an explicit reveal. Links permit HTTP, HTTPS, and valid email destinations. Unloaded replies use a scoped lookup from an already-known group message.

## Conversation data

TanStack Query owns history pages, topic pages and lookups, reply excerpts, group summaries, and outgoing messages in memory. It also caches small avatars and previews. Each account and group connection has a separate scope. Only avatar and preview bytes have a persistent native cache. Clockalong does not add a server, database, or persistent message history. Local state holds operation controls and temporary object URLs.

Basic groups and supergroups without topics have one conversation. Forum groups have separate topic histories, including General. History and topics support older-page cursors. Server counts remain separate from the number of loaded records.

Message records contain text, formatting entities, sender identity, reply context, and attachment metadata. Only selected-group records and their required transfer references enter the cache. Whole SDK message objects and their broader peer collections do not. References to replies outside the group do not trigger reads of other conversations.

Realtime updates reconcile new messages, edits, deletions, and read-state changes. Send responses and realtime echoes share message identity, so they do not create duplicate rows. Routine topic refreshes retain visible pages until replacement data arrives. A reconnect or detected update gap discards old pagination cursors and refreshes from the newest page. Temporary network failure can retain stale data; group access failure makes the connection unavailable until retry.

## Sends and unread state

The group and topic summaries expose Telegram's unread counts and read positions. Fetching history does not mark messages as read. A caller must explicitly acknowledge a known message in the selected conversation. Concurrent acknowledgments coalesce, confirmed read positions never decrease, and successful acknowledgments refresh the summary. They do not automatically clear mentions.

The interface acknowledges a visible known message only near the bottom of an open conversation. The window must have focus, the document must be visible, and the transport must be connected. A covering media dialog stops acknowledgments. Read acknowledgments are cumulative; they do not prove exposure to every older message.

The plain composer sends with Enter and inserts a newline with Shift+Enter. Text sends and single-file sends can reply within the same conversation. When the optimistic message enters the cache, the send clears its originating draft. The message appears as a normal message, and the composer stays available for the next message. Text messages have no visible pending status. Topic changes, drawer closure, and Settings visits do not interrupt sends.

Telegram confirmation replaces the local message. Realtime updates and send responses use message identity to prevent duplicate rows. Local outgoing messages remain separate from server history and cannot advance read acknowledgments. Reconnects preserve their state.

Failure adds an error and Retry and Dismiss actions to the affected message. Each send retains its identity for an explicit retry. Other sends and drafts stay independent. Clockalong does not retry sends automatically or persist an outbox. The SDK can wait or retry internally. A cancellation after the final send request can have an unknown outcome; it does not prove Telegram rejected the message.

Cached permissions help reject restricted actions before a request. Telegram remains authoritative when permissions change. Failures expose fixed categories, including restrictions and wait periods, without raw provider errors or content.

## Attachments

The file picker, drops onto the open drawer, and file pastes into the focused composer select one attachment. Multiple files and folders are rejected. Selection does not send a file. Uploads accept one selected File or Blob per send. Progress and cancellation appear on the outgoing attachment, without blocking the composer.

Media mode uses supported photos and videos with verified compatibility metadata. Original mode sends the supplied file as a document. An unprobed or unsupported video uses the document path. Media mode does not promise local compression or video transcoding.

Upload limits follow Telegram's account configuration within the installed SDK's supported limits. Full downloads stream to a writable destination with bounded buffering and respect destination backpressure. The service does not assemble large files in the Query cache. Expired file references permit one scoped refresh and retry for the same attachment. Protected and ephemeral attachments are not downloadable.

Downloads stream through a narrow native writer into the system Downloads folder. Rust restricts remote names to safe filenames and adds a number when a name already exists. It never overwrites an existing file. Only a complete transfer becomes a finished file. Cancellation, transfer failure, group teardown, and normal app exit remove partial downloads. Completed downloads remain on disk after unlink or disconnect.

The native writer accepts bounded binary chunks and runs file work off the main thread. It does not grant the frontend general filesystem access or accept arbitrary destination paths. Abrupt termination can leave a hidden partial file. A filesystem without hard-link support cannot publish a download through this writer.

Full media streams into an isolated native temporary directory before viewing. Images fit the dialog; videos use native controls without autoplay. Unsupported codecs offer Download. The viewer detaches media before release and cancels transfers on closure, replacement, or scope teardown. Normal exit removes temporary files, and startup removes crash leftovers. These files are not a persistent chat cache.

Native asset responses and image decoding can still use memory proportional to the full file.

Small avatars and attachment previews use a native disk cache before a download. Telegram image identity determines reuse; changed images use new entries. The cache survives app restarts for the same account and group.

The image cache stores only image bytes, with limits of 512 KiB per image, 64 MiB total, and 1,024 images. Eviction removes the least recently used images. Cache failures permit normal downloads.

Group unlink, account disconnect, and revoked-session cleanup remove the disk cache and invalidate active access handles. Late downloads cannot restore removed entries. A different account or group cannot reuse the previous cache. Normal app teardown retains it. Consumers own temporary object URLs, which are revoked on cleanup or scope cancellation. The installed SDK cannot download files that require its unsupported CDN redirect path.

## App configuration

The native build receives the Telegram app ID and hash from its environment. The development launcher loads local development configuration automatically; exported values take precedence. The normal release launcher loads local production configuration, with exported values taking precedence. Development files are excluded from release configuration.

Cargo embeds both values and rebuilds when they change. Packaged apps launched from Finder need no environment configuration. Missing app configuration disables only Telegram.

Bundled app values remain extractable. They identify Clockalong; each user separately authorizes an account. The user session is the account credential and stays outside settings backups and browser persistence. Protocol logging is disabled, and UI errors contain fixed safe messages.

## Supported use

Use one Telegram-enabled Clockalong instance. Auth development requires a full restart. Concurrent instances that share a session can invalidate it.

The MVP excludes phone/code login, password recovery, cross-process coordination, and seamless hot reload. Browser preview renders a disconnected fallback and explains that login requires the desktop app.

Albums, message search, reactions, typing indicators, topic administration, custom emoji downloads, and streaming playback before download completion are outside this chat interface.
