# Authentication

Clinear treats authentication as a short provider checklist. Users connect the services they need, get toast feedback for
success or failure, and continue once both required providers are connected.

Do not turn authentication into a large setup wizard. The visible UI should mostly be the existing provider buttons,
loading feedback while an action is running, and a connected indicator once a provider is ready.

## Current direction

- Rust owns credential lifecycle and storage.
- The frontend owns the visible authentication screen, toasts, routing, and API clients.
- Provider API calls should happen in TypeScript when a provider has a practical frontend client.
- Rust should not become a broad API proxy unless a provider forces that design.
- Refresh tokens stay native-side only.
- Long-lived credentials are persisted native-side only, but a provider may expose a working credential to the frontend
  on demand when its TypeScript API client needs it.
- Short-lived access tokens may be passed to the frontend when the frontend needs them to call an official SDK.
- The auth snapshot can stay simple for now, with provider-level connected booleans.
- More detailed visible states should wait until the product needs them.

The Streamlink Tauri app is the closest local reference for this split. Its useful pattern is not the Twitch-specific
sign-in UI. The useful pattern is that Rust stores and refreshes credentials, exposes a small token/auth bridge, emits
simple state changes, and lets the frontend API client call the external service directly with an access token.

## Authentication screen

The first screen should remain a compact connection checklist:

- Show one row or button per provider.
- Disable a provider button while its connection attempt is running.
- Show a spinner inside the pending provider button.
- Show a connected icon or connected button state after success.
- Use success toasts for completed connections.
- Use error toasts for failed or cancelled connections.
- Keep the screen focused on the provider buttons. Do not add a product logo or heading unless users cannot tell what
  screen they are on.
- Do not add persistent explanatory copy unless the flow becomes unclear in practice.
- Do not add detailed per-provider state labels beyond connected or disconnected for the first pass.

The screen should not show a Linear API key field. Linear's default product flow is OAuth. Asking for a Linear API key
would make Clinear feel like a personal script and would teach users the wrong integration path.

## Native responsibilities

Rust should handle the parts that are native, sensitive, or hard to do cleanly in the webview:

- Start provider authentication.
- Receive OAuth callbacks when the provider uses browser authorization.
- Verify OAuth state and PKCE data.
- Exchange authorization codes for tokens.
- Store refresh tokens and other long-lived credentials.
- Store or derive access token expiry metadata.
- Refresh access tokens.
- Clear credentials.
- Emit auth-state changes.
- Return a valid working credential to the frontend when a provider's TypeScript client needs one.

Secure storage is preferred for long-lived provider credentials. For the first real implementation, Stronghold is a
reasonable fit because there is already a local Tauri reference app using it successfully. Native Keychain storage is
also acceptable if the implementation stays straightforward. Normal Tauri store is fine for non-secret auth metadata,
but it should not hold refresh tokens or user API keys once the app is meant to be distributed.

Native auth code is split by provider rather than kept in one large module. `auth.rs` owns the Tauri command surface,
public snapshot, and `clinear-auth:state-changed` event. `auth_clockify.rs` owns Clockify API-key validation and storage.
`auth_linear.rs` owns Linear OAuth, loopback callback handling, token refresh scheduling, and disconnect. `stronghold.rs`
is the shared native secret helper.

## Frontend responsibilities

The frontend should handle the parts that are UI-specific or API-client-specific:

- Render provider buttons and connected indicators.
- Keep local button loading state.
- Show toasts for success, failure, cancellation, and retryable issues.
- Redirect between auth-gated and app routes based on the native auth snapshot.
- Request provider credentials from Rust when a frontend API client needs them.
- Create and use provider API clients in TypeScript where practical.
- Avoid storing provider tokens in local storage, route state, or broad global UI state.
- Avoid logging request headers, access tokens, refresh tokens, API keys, or token-bearing errors.

Credentials passed to the frontend should be treated as in-memory working credentials. They are allowed because the
frontend needs them for direct API clients, but frontend code should not make them persistent or visible beyond that
request flow.

## Validation outcomes

Rust should keep the public auth snapshot simple, but internally it should distinguish why validation failed. That
distinction controls whether stored credentials are deleted.

- Invalid or revoked credential: mark the provider disconnected and clear the stored credential.
- Transient validation failure: mark the provider disconnected, keep the stored credential, and allow a later retry.
- Successful validation or refresh: mark the provider connected and expose the working credential to the frontend on
  demand.

A transient failure never means offline authenticated mode. It only means Clinear keeps the saved credential so the user
does not have to paste it again before the next validation attempt.

## Clockify

Clockify should use a user-provided API key. Clockify does not document a normal OAuth or PKCE flow for REST API
consumers, so Clinear should not present Clockify as an OAuth provider or ship a Clockify credential.

User flow:

- The user clicks the Clockify connection button.
- The frontend opens a small dialog.
- The dialog shows one regular text input for the API key.
- The dialog links directly to Clockify's API key management page at `https://app.clockify.me/manage-api-keys`.
- The user submits the key.
- The frontend calls `clinear_auth_connect_clockify`.
- Rust validates the key against Clockify.
- If validation succeeds, Rust stores the key in secure native storage, emits an auth-state change, and the frontend
  shows a success toast.
- If validation fails, Rust does not store the key, the auth state remains disconnected, and the frontend shows an error
  toast.

Keep the visible UI minimal. Use toasts exclusively for success, error, and validation feedback. Do not add persistent
validation panels or extra status text. After Clockify is authorized, the Clockify button should show a connected state,
such as a check icon or connected label.

The Clockify API key input should be a normal text input, not a password input. The user needs to see what they pasted
before submitting it.

Rust owns Clockify credential storage and auth-state validation. Store the API key in secure native storage. Stronghold
matches the Streamlink Tauri reference app and is the preferred first implementation unless the project deliberately
chooses a native Keychain crate later. Do not store the API key in normal Tauri store.

Startup behavior should be strict. On every app launch, Rust reads the saved Clockify API key and validates it against
Clockify before marking Clockify as connected. Clinear does not support offline Clockify mode. If startup validation
fails, Clockify is not authenticated.

Validation should use Clockify's current-user endpoint. A valid response means the key identifies a Clockify user and can
be treated as authenticated. Invalid credentials should leave Clockify disconnected and clear the saved key. Transient
Clockify or network failures should leave Clockify disconnected but keep the saved key for retry.

The Clockify API key may be passed from Rust to the frontend while the app is running. The frontend needs the key because
Clockify API calls belong in the TypeScript client, not in Rust. Keep that bridge explicit and simple: the frontend asks
Rust for the current key when it needs to build or use the Clockify client. The key should stay in memory and should not
be written to browser storage, route state, logs, or broad UI state.

The frontend bridge should use `clinearAuth.getClockifyCredential()`, whose snapshot shape is `{ apiKey }`.

Clockify API calls should use the frontend Zodios client and send the API key as Clockify's API-key header. Rust should
not become a general Clockify API proxy. Its Clockify role is key storage, key validation, key clearing, startup auth
checks, auth-state events, and returning the key to the frontend on demand.

Subdomain and regional Clockify workspaces may need alternate base URLs. The first auth screen should not expose that as
main UI. If needed, base URL selection can live behind an advanced control later.

## Linear

Linear should use OAuth2 Authorization Code with PKCE:

- The user clicks the Linear connection button.
- The frontend calls `clinear_auth_connect_linear`.
- Rust creates the OAuth state and PKCE verifier/challenge.
- Rust starts a local callback receiver.
- Rust opens the system browser to Linear's authorization page.
- The user approves Clinear in Linear.
- Linear redirects to the local callback.
- Rust validates the callback state.
- Rust exchanges the authorization code for Linear tokens.
- Rust stores the refresh token and any useful token metadata in secure native storage.
- Rust emits an auth-state change.
- The frontend shows a success toast and updates the Linear button to connected.

Linear access tokens are short-lived. Rust should return a valid Linear access token to the frontend when the TypeScript
Linear client needs one. If the current access token is expired or near expiry, Rust should refresh first and then return
the new access token. The frontend bridge should use `clinearAuth.getLinearCredential()`, whose snapshot shape is
`{ accessToken }`.

The frontend should use the official Linear TypeScript SDK for normal Linear reads and mutations. Rust should not proxy
Linear issue queries, ticket lists, comments, or other regular GraphQL operations. The native layer's Linear role is
auth, token storage, refresh, and credential clearing.

Shipping rules:

- Ship the Linear OAuth client ID. The current public client ID is `1ef17fb4bbef1626a5f1f838843e067c`.
- Ship the registered redirect URI pool.
- Do not ship a Linear personal API key.
- Do not ship an OAuth client secret.
- Do not ship client-credentials secrets.
- Do not make personal API keys the default Linear setup path.

Clinear ships this redirect URI pool:

- `http://localhost:53682/oauth/linear/callback`
- `http://localhost:53683/oauth/linear/callback`
- `http://localhost:53684/oauth/linear/callback`

Rust should bind the first available callback port and send that exact matching redirect URI to Linear. This allows
multiple local worktrees to coexist as long as they are not all using every registered callback port at the same time.

Personal API-key support is only an optional future fallback. If it ever exists, it should be advanced/manual,
stored securely, and kept out of the normal auth screen.

Initial Linear scopes should be conservative. Start with read access for the assigned-ticket workflow. Add write scopes
only when Clinear has a concrete write feature. Avoid admin scopes unless a future feature has a strong reason for them.

Linear MCP integrations are useful context because they usually avoid pasted API keys through OAuth. That does not mean
Clinear should depend on MCP. It means our product flow should also be OAuth-first.

## Token refresh

Keep refresh behavior native-side. Rust refreshes on demand when the frontend asks for an access token, and schedules a
background refresh before the current access token expires. If a Linear API call still receives `401`, the frontend can
call `clinearAuth.refreshLinearCredential()` and retry the request once with a fresh SDK client.

If refresh succeeds, store the new token response and return the access token. If refresh fails because credentials are
invalid or revoked, clear Linear credentials, emit an auth-state change, and let the frontend show an error toast. If
refresh fails because the network or provider is temporarily unavailable, keep stored credentials, mark Linear
disconnected for the failed check, schedule a retry, and surface the error.

## Disconnect

Use "Disconnect" for provider auth removal rather than web-app "logout" language.

Linear disconnect is local-first and provider revocation is best effort. Rust should try to revoke the stored refresh
or access token when practical, then clear local Linear credentials, abort scheduled refresh work, clear auth metadata,
and emit an auth-state change even if provider revocation fails. The disconnect result may include `revocationStatus`,
but the UI should treat local credential removal as disconnected.

## Open implementation choices

- Decide whether to keep Stronghold long term or switch to native Keychain for provider credentials.
- Confirm the Linear OAuth app behaves correctly from packaged Tauri builds and local development.
- Decide whether Linear needs more than the initial `read` scope.
- Decide when to add disconnect UI. It is useful early for development, but it does not need to complicate the first
  auth screen.
