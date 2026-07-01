# Linear integration notes

Linear's normal integration path for Clinear is its public GraphQL API through the official `@linear/sdk` TypeScript client. Clinear should treat Linear as a user-authorized service: users connect their own Linear account with OAuth2, while the app ships only public OAuth metadata.

Rust owns Linear auth state and token storage. The broader Linear API client should live in the frontend and use the official TypeScript SDK when possible. The native layer should handle OAuth startup, callback verification, secure token storage, token refresh scheduling, auth-state initialization, and clearing credentials.

## Primary references

- Developer docs: https://linear.app/developers
- GraphQL API docs: https://linear.app/developers/graphql
- OAuth2 docs: https://linear.app/developers/oauth-2-0-authentication
- TypeScript SDK docs: https://linear.app/developers/sdk
- SDK and API monorepo: https://github.com/linear/linear
- MCP docs: https://linear.app/docs/mcp

`@linear/sdk` is official. The SDK docs are linked from Linear's developer site, and the public `linear/linear` monorepo describes `packages/sdk` as the Linear Client SDK for the GraphQL API. A registry check on 2026-06-24 showed `@linear/sdk` version `87.0.0`, MIT license, CJS/ESM exports, TypeScript declarations, and Node `>=18.x`.

## API shape

Linear's public API is GraphQL at:

```txt
https://api.linear.app/graphql
```

The API supports introspection and is explorable through Apollo Studio from the developer docs. It is the same API surface exposed by the SDK.

API behavior to preserve:

- GraphQL responses may return HTTP 200 while still including operation errors in an `errors` array.
- Rate limit failures can appear as GraphQL errors with extension code `RATELIMITED`.
- List fields use Relay-style cursor pagination with `first`/`after` and `last`/`before`.
- List queries return 50 records by default if no pagination arguments are provided.
- Most paginated results can be filtered; prefer server-side filters to broad fetches.
- Prefer `orderBy: updatedAt` for incremental refresh flows.
- Avoid per-issue polling. Linear explicitly recommends webhooks or narrow updated-data queries for update flows.

The first Clinear issue query should be based on the authenticated viewer, for example `viewer.assignedIssues(...)` through the SDK. Fetch only fields required for the ticket list, timer mapping, and issue detail surfaces.

## Assigned ticket sync

The Linear ticket list is backed by a local TanStack DB collection, not route-owned pagination. `src/services/linear/sync.ts` owns the background sync for the authenticated viewer's assigned issues across all workflow statuses.

Implementation constraints:

- Use `viewer.assignedIssues(first, after, orderBy)` with cursor pagination.
- Store compact assigned-ticket rows in the local collection under the authenticated Linear viewer ID.
- `linearTicketSyncLimit` controls the maximum number of assigned issues to sync.
- `linearTicketSortBy` maps to Linear's `PaginationOrderBy` field for the fetch. Current exposed values are `createdAt` and `updatedAt`.
- `viewer.assignedIssues` does not expose a sort-direction argument. Do not treat client-side ordering as an API fetch direction.
- `linearTicketSyncInterval` controls the provider's background sync interval.
- Dashboard UI should subscribe to the local collection with TanStack DB live queries instead of starting its own Linear pagination loop.
- Use focused raw GraphQL when the dashboard only needs a compact row DTO.
- If a compact assigned-ticket request receives `401`, refresh the native Linear credential and retry once with a new SDK client.
- Fetch status `color`, `type`, and `position`; `position` is used for Linear-like status ordering.
- Fetch assignee display fields and avatar fields for the row avatar.

The current dashboard row DTO is intentionally small: identifier, title, created/updated timestamps, status, assignee, and nullable tracking fields. Linear fetches initialize tracking fields as empty; the dashboard fills them by merging Clockify ticket summaries keyed by Linear issue ID. Full issue descriptions, labels, comments, and project/cycle detail belong in future detail surfaces that actually need them.

Linear workflow states expose one `color` hex value. The API does not provide separate light/dark status tokens. Clinear uses that color directly for the status badge background and computes a contrasting foreground locally.

## Authentication

Linear supports:

- OAuth2 for applications and integrations used by others.
- Personal API keys for personal scripts.
- Client credentials tokens for server-to-server app actor use.

Clinear should use OAuth2 Authorization Code with PKCE.

OAuth endpoints:

- Authorization: `https://linear.app/oauth/authorize`
- Token: `https://api.linear.app/oauth/token`
- Revoke: `https://api.linear.app/oauth/revoke`

During Linear disconnect, provider revocation is best effort. Send the token in the `token` form field with the matching `token_type_hint` when revoking with Linear. Local disconnect still wins if Linear revocation fails: clear local tokens, abort scheduled refresh work, emit auth state, and keep the user-visible state disconnected.

OAuth requirements and defaults relevant to Clinear:

- Use `response_type=code`.
- Use a high-entropy `state` value and reject callback responses where `state` does not match.
- Use PKCE with `code_challenge_method=S256`.
- In PKCE token exchange, `client_secret` is optional.
- For refresh tokens generated through PKCE, refresh can use `client_id` without `client_secret`.
- Access tokens are Bearer tokens and expire after about 24 hours.
- Token refresh returns a new access token and a new refresh token; update stored refresh token atomically.
- OAuth `actor=user` is the default and is the right fit for Clinear.
- `actor=app` is for agents, service accounts, and app-authored mutations. Do not use it for the normal personal time-tracking workflow.

Initial scopes should be conservative:

- Start with `read` for viewing assigned issues and metadata.
- Add `write` only when Clinear needs broad mutation access.
- Prefer narrower write scopes such as `comments:create` or `issues:create` if the feature only needs those actions.
- Avoid `admin`.

## Shipping decision

Do not ship:

- A Linear personal API key.
- An OAuth client secret.
- Client credentials for server-to-server auth.

Okay to ship:

- OAuth client ID.
- Registered redirect URI.
- Public app display metadata.

A packaged desktop app is a public client. Anything bundled in the app can be extracted, so a `client_secret` would not be secret. Linear's PKCE support is the correct model for this: the app ships a client ID, generates a per-login PKCE verifier, and exchanges the returned authorization code without a bundled secret.

Personal API keys should not be the default setup path. They are user-owned credentials intended for personal scripts. If Clinear ever supports them, treat API-key auth as an advanced "bring your own key" fallback, store it in native secure storage, and make revocation/clearing obvious.

## MCP authentication context

Official Linear MCP integrations do not ask users to paste API keys because they use OAuth. The MCP client starts an interactive authorization flow, the user grants access in Linear, and the MCP integration stores or manages the resulting tokens.

Linear's MCP server can also accept an OAuth token or API key through an `Authorization: Bearer <token>` header for programmatic setups. That does not change Clinear's product decision: the first-class user flow should still be OAuth2 with PKCE, not manual API keys.

Community or older local Linear MCP servers often ask for personal API keys because that is simpler to implement. Do not copy that pattern for Clinear's default UX.

## Desktop redirect

Linear's OAuth docs show localhost callback examples, and OAuth app manifests model redirect URIs as HTTP/HTTPS values. For a no-backend Tauri app, use a loopback callback such as:

```txt
http://localhost:<port>/oauth/callback
```

Use registered callback URLs because Linear requires redirect URI matching. Clinear uses a small registered port pool rather than arbitrary dynamic ports.

A custom URL scheme may be useful for Tauri generally, but do not assume Linear will accept it until tested against Linear's OAuth app configuration.

Clinear ships this public Linear OAuth client ID in Rust:

```txt
1ef17fb4bbef1626a5f1f838843e067c
```

This is safe to ship. It is not a secret, and users should not provide it.

Clinear uses this registered redirect URI pool:

```txt
http://localhost:53682/oauth/linear/callback
http://localhost:53683/oauth/linear/callback
http://localhost:53684/oauth/linear/callback
```

Register all three callback URLs in the Linear OAuth app. During auth, Rust binds the first available port and sends the matching redirect URI to Linear. Developers can override the redirect URI with `CLINEAR_LINEAR_REDIRECT_URI` if that exact callback URL is also registered in Linear.

## Client strategy

Preferred split:

- Rust starts and completes OAuth, including loopback callback handling.
- Rust stores refresh/access tokens in secure native storage, ideally Keychain-backed on macOS.
- Rust exposes auth state through the existing Tauri reactive state pattern.
- Rust exposes a command to return a valid short-lived access token, refreshing it first if needed.
- Rust schedules a refresh before token expiry and schedules retry refreshes after transient failures.
- The frontend creates `new LinearClient({ accessToken })` from `@linear/sdk`.
- The frontend performs normal Linear API reads through `@linear/sdk`.
- Do not store Linear tokens in the Tauri JSON store, browser local storage, or route state.
- Do not expose the refresh token to the frontend.

This keeps the high-volume API client in TypeScript. Rust stays responsible for the native parts: OAuth callback handling, secure storage, token refresh, revocation, and auth-state events.

It is acceptable for a short-lived access token to exist in frontend memory so the official SDK can run client-side. Keep that token in a narrow service module, refresh it through the native command on expiry, and avoid logging request headers or token-bearing errors.

## SDK usage direction

Use `@linear/sdk` rather than a hand-written GraphQL wrapper for normal Linear reads and mutations.

Useful SDK entry points:

- `new LinearClient({ accessToken })`
- `linearClient.viewer`
- `viewer.assignedIssues({ first, after, filter, orderBy })`
- Model methods such as issue comments or related objects when needed
- `linearClient.client.rawRequest(...)` only when a query is awkward or more efficient as custom GraphQL

Prefer custom raw GraphQL only when the SDK model path fetches too much data, cannot express the desired shape cleanly, or makes pagination/filtering harder than a focused query.

## Webhooks

Linear supports webhooks for issues, comments, labels, projects, cycles, users, OAuth revocation, and other models. However, a local desktop app cannot receive Linear webhooks without a reachable HTTPS endpoint. For Clinear's initial local-only architecture, use narrow pull-based refreshes instead of webhooks.

If Clinear later adds a backend, webhooks become useful for syncing issue changes and OAuth revocation events.

## Remaining checks

- Confirm the public Linear OAuth app works from packaged Tauri builds and local development.
- Decide whether Stronghold remains the long-term credential storage mechanism or whether native Keychain is worth the extra platform-specific work.
- Decide whether Linear needs more than the initial `read` scope.
- Test `@linear/sdk` in the Tauri webview production origin. A 2026-06-24 preflight check returned CORS allow headers for both localhost and `tauri://localhost`, but implementation should still verify this in-app.
- Decide whether API-key fallback is worth supporting; default should be OAuth.
