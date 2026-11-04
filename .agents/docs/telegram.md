# Telegram

Telegram provides persistent incoming notifications and agent sends for one selected group. It is optional and independent of Clockify authentication. Clockalong has no chat interface or composer.

The frontend service owns one private mtcute MTProto client above routes. Rust stores its session and private group reference and publishes connected state. Consumers receive scoped operations, not direct client or credential access.

## Account and group lifecycle

Users authorize an existing account by scanning a QR code with Telegram. A two-step password is requested when required. Authorization and native session storage must both succeed before connection completes.

Cancelling login clears temporary inputs and prevents late results from saving a session. Startup validates the saved session without opening interactive login. Transient restore failures retain it for retry; definite invalid sessions are removed.

Group selection accepts an invite link for a group the account already belongs to. It checks membership without joining groups or listing conversations. Basic groups and supergroups, with or without topics, are supported. Broadcast channels, gigagroups, and monoforums are excluded.

Group verification is separate from account authentication. Failed verification retains the selection for retry. Unlink removes the local selection without leaving the Telegram group. A migrated basic group requires reconnection using its current invite.

Disconnect removes local authorization and attempts remote logout. A failed local deletion remains an error. If remote logout is unconfirmed, the user can terminate the session through Telegram's Devices settings.

Fresh authorization and invalid-session cleanup clear the selected group. Normal teardown retains the session and selection. Account and group operations are serialized; old clients and late results cannot alter a newer connection.

Use one Telegram-enabled app instance per session. Concurrent instances sharing a session and seamless hot reload are unsupported. Browser preview cannot authorize Telegram accounts.

## Incoming notifications

Group connection starts collection across all topics. Initial collection includes the three latest eligible messages for discovery, then retains new arrivals. Eligible messages come from other accounts and exclude outgoing messages and service events.

Collection uses history and realtime updates independently of routes and card visibility. A successful history scan advances the collection checkpoint. Realtime arrivals do not advance it, so reconnect and periodic scans can recover missed messages.

Cards remain until manually cleared, including across restarts. Clear state is local and never marks messages read in Telegram. Replayed history and edits cannot restore cleared cards.

Clear all applies to the selected scope in one transaction. Later arrivals remain visible. Album messages share a card only within the same account, group, topic, and sender; clearing it applies to its displayed messages.

Edits refresh retained content. Deleted messages leave a deletion card until cleared. Saved cards remain available during a transient connection failure when the saved scope is known.

Snooze hides the feed for 15 minutes while collection continues. A saved deadline survives reloads. The root checks expiry and rechecks after focus or visibility changes.

An optional local development flag replays three recent messages on each reload without changing production clear state. Production builds ignore it.

## Trigger input

Incoming message collection also supplies Paseo triggers. Each trigger belongs to one account and group. An optional marker requires an exact match before regex evaluation. Text and captions supply pattern input; hidden link destinations, quoted replies, and attachment contents do not.

Each trigger has its own enable state. Users author a regex and name the tokens for its automatically detected captures. Marker and token names use lowercase letters, numbers, and single hyphens between words; names start with a letter. Capture token names must be unique and cannot use reserved context names.

Every capture needs a nonblank mapping and captured value, even when the prompt does not use it. Prompts retain their line breaks. Missing referenced values prevent execution. The preview evaluates sample text without executing commands.

Users can also confirm a real run from the sample-message preview. The current form must pass validation and match the sample before confirmation. This runs the current draft without saving or enabling it. Sender and topic tokens use sample values. Manual runs create no Telegram notification or automatic execution record.

Users select a registered Paseo project, an enabled provider, a model, a supported thinking effort, and a permission mode. Available permission modes come from Paseo. Triggers without an explicit mode retain Paseo’s default behavior.

Each match starts an agent in a fresh worktree from main. The user’s prompt controls PR checkout and task instructions. Save validates required fields and available selections. New triggers default to enabled; incomplete saved triggers remain disabled.

Pattern evaluation has a deadline and runs outside the UI thread. Paseo owns the resulting workspaces, agents, permissions, and task progress. Clockalong supplies no review instructions or automatic timer actions.

Only new eligible messages after trigger activation can create executions. Discovery messages, edits, existing records, and development replay do not create executions. Recovery can collect eligible messages received while the app was unavailable.

Collection saves matching execution requests and notification records together before advancing the checkpoint. Clearing cards and snoozing the feed do not affect triggers. Scope changes and disabled or edited triggers cancel requests that have not started.

## Cards and images

Cards use the theme's primary color and have a separate scroll area with hidden scrollbars. Clear all and Snooze sit below the list. Ordinary application toasts remain separate.

Cards show sender, topic, timestamp, text, and attachments. Avatars fall back to initials. Replies show a short sender and text excerpt from retained data or a selected-group fetch. Unavailable replies use a placeholder, and quoted spoilers remain hidden.

Supergroup cards link to the message in Telegram, including topic context where available. Basic groups have no message-link control. Opening a link or image does not clear the card.

Image thumbnails are rounded 64-pixel squares in a wrapping row. They open the shared zoomable lightbox. Photos and JPEG, PNG, WebP, and GIF image documents support viewing up to 20 MiB. Other attachments remain metadata with access through Telegram.

Full images preload when notification cards mount. Preloading and viewing share requests and the same Telegram client and data-center connections. Hover does not start downloads. Snoozed cards are not mounted; their images wait until the feed returns.

Spoilers require explicit reveal before loading. Protected and ephemeral content has no downloadable preview or image. Expired transfer references permit one scoped refresh and retry.

The installed client cannot download images that require Telegram CDN redirects.

The service retains recent notification records to avoid repeated metadata lookups. Storage owns the native image cache and persistence limits.

## Scoped service behavior

The SDK can receive account-wide updates, but only selected-group records enter application caches. History, topics, sender data, and transfer references remain connection-scoped. Reads do not send read acknowledgements.

Realtime edits and deletions protect loaded records from late responses. Reconnect recovery resets history cursors and short-lived file references. Teardown cancels scoped operations; late results cannot restore them.

Group access failure stops scoped operations without disconnecting the account. Normal navigation and window hiding do not end the service.

## Agent sends

The local MCP server can discover the selected group and visible topics and send plain text or one attachment. There is no history-reading tool, persistent outbox, or automatic resend.

The service checks selection, topic availability, and permissions before sending. An unavailable topic never falls back to General. Sends cannot target unrelated groups or compose replies to individual messages.

Supported photos and locally playable MP4 videos default to media. Other formats use document delivery; callers can explicitly request the original file. Media classification does not promise compression or transcoding.

Confirmed sends update existing read caches without creating notifications for the connected account. Inputs are released when the request settles. Request deadlines and scope teardown cancel sends; navigation and Clockify authentication do not.

A failure after submission can leave delivery unconfirmed. Callers must check Telegram before retrying. Telegram remains authoritative when permissions change. Errors expose fixed categories without raw provider content or credentials.
