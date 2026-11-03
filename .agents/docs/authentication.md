# Authentication

Clockify is the only app-level authentication requirement. Optional provider failures do not redirect an authenticated Clockify user away from the dashboard. Each optional provider controls access to its own data and actions.

The sign-in screen is a compact connection surface. Users explicitly continue to the dashboard after connecting Clockify, so they can connect optional providers first. Telegram connection is also available there.

## Credential ownership

Rust stores durable credentials in Stronghold and publishes the authentication snapshot. The frontend owns connection dialogs, feedback, and routing.

Frontend provider clients obtain working credentials through narrow native calls and keep them in memory. Refresh tokens stay native. Credentials do not belong in settings, browser persistence, route state, or logs.

Clockify and GitHub validate user credentials against the provider's current-user endpoint. Startup validation must succeed before either provider is marked connected. Invalid credentials are removed. Transient failures retain saved credentials for retry but do not enable an offline authenticated mode.

Clockify validation participates in native app initialization. Linear and GitHub startup checks run independently. Telegram restores after native initialization and does not block it.

## Provider connections

- Clockify uses a user-supplied API key.
- GitHub uses a user-supplied personal access token. The UI recommends fine-grained tokens with read access to Metadata, Issues, and Pull requests for the selected repositories.
- Linear uses browser OAuth Authorization Code with PKCE and read access. Rust verifies callback state, exchanges tokens, and owns refresh scheduling.
- Telegram uses QR authorization and an optional two-step password through its frontend MTProto service. Rust persists the resulting session.

Clockify and GitHub credential dialogs let users inspect pasted values before submitting them. Feedback uses loading states and toasts.

Linear is a public desktop OAuth client. It embeds a client ID and registered loopback redirects, not a client secret or personal API key. A pool of registered loopback ports lets local worktrees use separate callbacks.

Missing Linear build configuration prevents provider requests and refresh scheduling without deleting saved tokens. It does not block Clockify.

## Refresh and disconnect

Linear refreshes before expiry and on demand. If a Linear read returns an authorization error, the frontend refreshes the credential and retries once. Successful refresh replaces stored token data. Invalid credentials are cleared; transient failures retain them and schedule another attempt.

Disconnect removes local authorization. Linear also attempts provider revocation, but a revocation failure does not prevent local disconnect. Clockify keys and GitHub tokens must be revoked through their providers.

Disconnecting a tracking provider clears its local data and prevents stale results from restoring the session. Clockify also clears workspace-bound project choices and the active Quick Timer association.

Telegram separates account authentication from group verification. Its connection, retry, and group lifecycle belong to the Telegram domain.
