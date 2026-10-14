# Telegram

## Scope

Telegram is an optional account connection. It supports login, session restore, disconnect, and one selected group. Clockify remains the only app-level authentication requirement.

Clockalong does not read topics or messages, send messages, or show a Telegram dashboard widget. Users need an existing Telegram account and the official Telegram phone app.

## Ownership

One private frontend service owns the MTProto client and its active operation. A thin provider owns the service above routes. Sign-in and Settings share a compact authentication dialog.

The frontend performs Telegram authentication and session validation through mtcute. The client uses memory storage and disables general update processing while retaining QR confirmation updates. Components cannot access the client or saved session.

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

## Selected group

Settings accepts an existing invite link for a group the signed-in account already belongs to. Both friends can use the same link with their own accounts. Clockalong checks membership and fetches only that group's metadata. It never joins groups or lists conversations.

Basic groups and supergroups with or without topics are supported. Broadcast channels, gigagroups, monoforums, and inaccessible groups are rejected. A migrated basic group must be unlinked and connected again with its current invite link. Verification refreshes the title and whether the group has topics. Topic and message UI remain outside this feature.

Rust stores one group reference bound to the account in Stronghold, including private access data for supergroups. The provider exposes only the title, marked group ID, topic-mode flag, and verification state. Invite links are temporary input and are not stored. Group data stays outside Settings backups, browser storage, and logs.

After account restore succeeds, the service verifies the saved group. Group failure keeps the selection for Retry and does not disconnect the account. Saved identity remains visible when account restore fails so Unlink works offline. Unlink removes only the local selection; it never leaves the Telegram group. Failed removal remains an error.

Disconnect, invalid-session cleanup, and fresh QR authorization clear the group. An absent saved session also clears any orphan selection. A new authorization cannot reuse the old access data, even for the same account. Normal teardown retains both records. The existing operation guard serializes verification, saves, and removals. Results discarded after teardown cannot start a group save.

## App configuration

The native build receives the Telegram app ID and hash from its environment. The development launcher loads local development configuration automatically; exported values take precedence. The normal release launcher loads local production configuration, with exported values taking precedence. Development files are excluded from release configuration.

Cargo embeds both values and rebuilds when they change. Packaged apps launched from Finder need no environment configuration. Missing app configuration disables only Telegram.

Bundled app values remain extractable. They identify Clockalong; each user separately authorizes an account. The user session is the account credential and stays outside settings backups and browser persistence. Protocol logging is disabled, and UI errors contain fixed safe messages.

## Supported use

Use one Telegram-enabled Clockalong instance. Auth development requires a full restart. Concurrent instances that share a session can invalidate it.

The MVP excludes phone/code login, password recovery, cross-process coordination, and seamless hot reload. Browser preview renders a disconnected fallback and explains that login requires the desktop app.
