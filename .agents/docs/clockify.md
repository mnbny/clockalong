# Clockify integration notes

Clockify's regular REST API uses user-owned API keys. Clinear treats Clockify as a user-authorized external service,
not as an OAuth provider with a shippable app credential.

Rust owns Clockify credential storage and auth state. Clockify API calls should be implemented client-side in the
frontend after the native layer has supplied the authenticated state and whatever token access contract Clinear settles
on.

## Primary references

- API docs: https://docs.clockify.me/
- OpenAPI spec: https://docs.clockify.me/openapi.json
- API key help: https://clockify.me/help/administration/api-webhook-settings
- Profile key generation help: https://clockify.me/help/getting-started/manage-your-profile-settings
- Official API examples: https://github.com/clockify/api-examples

## Authentication

- Public REST API calls authenticate with the `X-Api-Key` header.
- Users generate API keys from their Clockify profile settings.
- API keys are user credentials and should not be shipped with Clinear.
- Clockify does not document an OAuth or PKCE flow for normal REST API consumers.
- Clinear should ask each user for their own Clockify API key and store it through native secure storage, not the
  Tauri JSON store.
- Rust should handle saving, reading, validating, and clearing the key. The broader Clockify API client belongs in the
  frontend.
- Validate a saved key by calling `GET /v1/user`.
- Subdomain and regional workspaces may require a workspace-specific key or alternate base URL. Keep base URL handling
  configurable instead of hard-coding every request to the global host.

Clockify also has a CAKE.com Marketplace add-on model that uses `X-Addon-Token` and add-on scopes. That path is meant
for marketplace add-ons embedded in or installed into Clockify workspaces. It is not the first-choice auth model for
Clinear's local Tauri desktop app.

## API shape

The API is broad and documented through Redoc plus an OpenAPI 3 spec. The endpoints most relevant to Clinear are:

- `GET /v1/user`: verify credentials and identify the current Clockify user.
- `GET /v1/workspaces`: list workspaces available to the key.
- `GET /v1/workspaces/{workspaceId}/projects`: list projects for mapping or selection.
- `GET /v1/workspaces/{workspaceId}/projects/{projectId}/tasks`: list tasks if Clinear maps Linear issues to tasks.
- `POST /v1/workspaces/{workspaceId}/time-entries`: create or start a time entry.
- `GET /v1/workspaces/{workspaceId}/time-entries/status/in-progress`: inspect running timers in a workspace.
- `GET /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: read a user's time entries for summaries.
- `PATCH /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: stop the currently running timer for a user.
- `POST /v1/workspaces/{workspaceId}/reports/detailed`: generate detailed reports for reconciliation.
- `POST /v1/workspaces/{workspaceId}/reports/summary`: generate grouped summaries.

Clockify permissions follow the authenticated user's Clockify role and workspace access. Clinear should assume a normal
user key can manage that user's own timer/time entries, while admin-style workspace operations may fail unless the user
has the required Clockify role.

## Client strategy

Clockify does not publish an official TypeScript or Rust SDK for the API-key workflow. Clinear uses Zodios for the
frontend Clockify API client, following the generated-client pattern from `~/Dev/polybot-v2/api`.

- `clockify/api-examples` is official and useful as request reference, but it is not a maintained SDK.
- `clockify/addon-java-sdk` is official for CAKE.com Marketplace add-ons, not Clinear's desktop flow.
- `clockifixed` is a newer third-party TypeScript wrapper generated from the OpenAPI spec, with Zod validation.
- `clockify-ts` is an older third-party TypeScript wrapper.

Clinear implementation:

- Keep the Clockify API client in the frontend.
- Generate a Zodios client from Clockify's OpenAPI spec with `openapi-zod-client`.
- Use `@zodios/core`, `axios`, and the generated Zod schemas/types for request and response typing.
- Keep Rust limited to authentication/token responsibilities: secure key storage, auth-state initialization,
  validation, clearing credentials, and token/key retrieval according to the app's chosen bridge contract.
- Do not build a Rust Clockify API client.

## Zodios setup

Use `~/Dev/polybot-v2/api` as the local reference, but keep Clinear as a single app repo. Do not create workspace
packages or an `api/` package here.

The Clinear setup lives under `src/services/clockify/`:

- `specs/clockify-openapi.json`: downloaded Clockify OpenAPI spec.
- `generated/clockify.ts`: generated Zodios client and exported schema/type definitions.
- `client.ts`: app-facing client factory and default base client instance.
- `index.ts`: public exports for Clockify service code.

Polybot reference points:

- `api/package.json`: has a `generate` script that runs `openapi-zod-client ... -o src/*.ts`, depends on
  `@zodios/core`, `axios`, `zod`, and `openapi-zod-client`.
- `api/specs/`: stores source OpenAPI specs.
- `api/src/*.ts`: generated files export `schemas`, `api`, and `createApiClient(baseUrl, options)`.
- `api/src/api.ts`: creates concrete clients with known base URLs and shared `axiosConfig`.

For Clinear, adapt that pattern to Clockify:

- Regenerate with `pnpm clockify:generate`.
- Fetch the spec from `https://docs.clockify.me/openapi.json`.
- Generate `src/services/clockify/generated/clockify.ts`.
- Export `createClockifyClient(baseUrl, options)` and `clockify` from `src/services/clockify/client.ts`.
- Configure auth by attaching `X-Api-Key` from the native auth bridge before Clockify requests.
- Keep regional and subdomain base URL selection outside the generated client so it can be changed per workspace.

The generated file is intentionally marked `// @ts-nocheck`. Clockify's OpenAPI spec currently produces a few circular
type/default-value errors in the generated implementation. App code should still import the generated aliases, schemas,
and exported types through `src/services/clockify`, but should not manually edit the generated file.
