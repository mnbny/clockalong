# Clockify integration notes

Clockify's regular REST API uses user-owned API keys. Clockalong treats Clockify as a user-authorized external service, not as an OAuth provider with a shippable app credential.

Rust owns Clockify credential storage and auth state. Clockify API calls stay in the frontend. When the TypeScript client needs to call Clockify, it asks Rust for the validated API key and keeps that key in memory only.

## Primary references

- API docs: https://docs.clockify.me/
- OpenAPI spec: https://docs.clockify.me/openapi.json
- API key management: https://app.clockify.me/manage-api-keys
- Official API examples: https://github.com/clockify/api-examples

## Authentication

- Public REST API calls authenticate with the `X-Api-Key` header.
- Users generate API keys from their Clockify profile settings.
- API keys are user credentials and should not be shipped with Clockalong.
- Clockify does not document an OAuth or PKCE flow for normal REST API consumers.
- Clockalong should ask each user for their own Clockify API key and store it through native secure storage, not the Tauri JSON store.
- Rust should handle saving, reading, validating, and clearing the key. The broader Clockify API client belongs in the frontend.
- Validate a saved key by calling `GET /v1/user`.
- Startup validation should mark Clockify disconnected whenever validation does not succeed; Clockalong does not support offline authenticated Clockify mode.
- Clear the saved key only when validation clearly fails because the credential is invalid or revoked. Keep the saved key after network or provider failures so the app can retry without asking the user to paste it again.
- Subdomain and regional workspaces may require a workspace-specific key or alternate base URL. Keep base URL handling configurable instead of hard-coding every request to the global host.

Clockify also has a CAKE.com Marketplace add-on model that uses `X-Addon-Token` and add-on scopes. That path is for marketplace add-ons embedded in or installed into Clockify workspaces. It is not the right auth model for Clockalong's local Tauri desktop app.

## API shape

The API is broad and documented through Redoc plus an OpenAPI 3 spec. The endpoints most relevant to Clockalong are:

- `GET /v1/user`: verify credentials and identify the current Clockify user.
- `GET /v1/workspaces`: list workspaces available to the key.
- `GET /v1/workspaces/{workspaceId}/projects`: list projects for mapping or selection.
- `GET /v1/workspaces/{workspaceId}/projects/{projectId}/tasks`: list tasks if Clockalong maps Linear issues to tasks.
- `POST /v1/workspaces/{workspaceId}/time-entries`: create or start a time entry.
- `PUT /v1/workspaces/{workspaceId}/time-entries/{id}`: update a completed time entry, including overlap-repair start/end shifts.
- `GET /v1/workspaces/{workspaceId}/time-entries/status/in-progress`: inspect running timers in a workspace.
- `GET /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: read a user's time entries for the background entry sync and small direct reads such as the running timer.
- `PATCH /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: stop the currently running timer for a user.
- `POST /v1/workspaces/{workspaceId}/reports/detailed`: generate detailed reports for reconciliation.
- `POST /v1/workspaces/{workspaceId}/reports/summary`: generate grouped summaries.

Clockify reports use a separate base URL from regular API calls:

- Regular API: `https://api.clockify.me/api`
- Reports API: `https://reports.api.clockify.me`

The public OpenAPI spec includes report paths and path-level report servers. Keep reports on a separate app client so the regular API base URL does not leak into report requests.

Clockify permissions follow the authenticated user's Clockify role and workspace access. Clockalong should assume a normal user key can manage that user's own timer and time entries. Admin-style workspace operations may fail unless the user has the required Clockify role.

## Entry descriptions

Clockalong builds Clockify time-entry descriptions from the user-configured Linear issue template in `src/services/clockify/description-template.ts`.

- Default template: `{identifier}: {title} [{internal-ref}]`.
- Template variables use single braces and must be explicitly listed by `ClockifyDescriptionTemplateToken`.
- The settings UI should expose only values available from the synced assigned-ticket row: `{identifier}`, `{title}`, `{number}`, `{url}`, `{teamKey}`, `{stateName}`, `{assigneeName}`, and `{internal-ref}`.
- Missing, `null`, `undefined`, and empty string values use the configured fallback.
- The default fallback is `n/a`; numeric `0` remains a real value.
- `{internal-ref}` is a stable Clockalong marker used to match Clockify entries back to provider work items. For Linear it renders as `ref:linear:{workspaceSlug}:{issueIdentifier}`.
- Template and fallback preferences are stored through `useStorage` as `clockifyDescriptionTemplate` and `clockifyDescriptionTemplateFallback`.
- Timer creation should format from the assigned-issue list DTO when possible. Do not fetch full issue details only to build the Clockify description.
- New time entries should use the `clockifyBillable` storage preference for their initial billable flag. The default is billable.

## Client strategy

Clockify does not publish an official TypeScript or Rust SDK for the API-key workflow. Clockalong uses Zodios for the frontend Clockify API client, following the generated-client pattern from `~/Dev/polybot-v2/api`.

- `clockify/api-examples` is official and works as request reference, but it is not a maintained SDK.
- `clockify/addon-java-sdk` is official for CAKE.com Marketplace add-ons, not Clockalong's desktop flow.
- `clockifixed` is a newer third-party TypeScript wrapper generated from the OpenAPI spec, with Zod validation.
- `clockify-ts` is an older third-party TypeScript wrapper.

Clockalong implementation:

- Keep the Clockify API client in the frontend.
- Generate a Zodios client from Clockify's OpenAPI spec with `openapi-zod-client`.
- Use `@zodios/core`, `axios`, and the generated Zod schemas/types for request and response typing.
- Use `@tanstack/react-db` for the local Clockify time-entry collection when UI needs recent entry-level data.
- Keep Rust limited to authentication/token responsibilities: secure key storage, auth-state initialization, validation, clearing credentials, and token/key retrieval according to the app's chosen bridge contract.
- Do not build a Rust Clockify API client.

## Zodios setup

Use `~/Dev/polybot-v2/api` as the local reference, but keep Clockalong as a single app repo. Do not create workspace packages or an `api/` package here.

The Clockalong setup lives under `src/services/clockify/`:

- `specs/clockify-openapi.json`: downloaded Clockify OpenAPI spec.
- `specs/clockify-reports-openapi.json`: generated report-only spec derived from the official Clockify spec.
- `generated/clockify.ts`: generated Zodios client and exported schema/type definitions.
- `generated/reports.ts`: generated Zodios client for Clockify's reports host.
- `client.ts`: app-facing client factories and default client instances.
- `projects.ts`: project-list helpers for selecting the default Clockify project.
- `sync.ts`: TanStack DB localStorage-backed entry collection plus the `ClockifySyncProvider` that periodically reconciles recent Clockify entries.
- `work-item-summaries.ts`: provider-neutral dashboard aggregation of Clockify time entries whose descriptions contain a supported `ref:*` internal marker.
- `ticket-summaries.ts`: Linear wrapper around provider-neutral work-item summaries.

Polybot reference points:

- `api/package.json`: has a `generate` script that runs `openapi-zod-client ... -o src/*.ts`, depends on `@zodios/core`, `axios`, `zod`, and `openapi-zod-client`.
- `api/specs/`: stores source OpenAPI specs.
- `api/src/*.ts`: generated files export `schemas`, `api`, and `createApiClient(baseUrl, options)`.
- `api/src/api.ts`: creates concrete clients with known base URLs and shared `axiosConfig`.

For Clockalong, adapt that pattern to Clockify:

- Regenerate with `pnpm clockify:generate`.
- Fetch the spec from `https://docs.clockify.me/openapi.json`.
- Generate `src/services/clockify/generated/clockify.ts`.
- Prepare the report-only spec with `scripts/prepare-clockify-specs.mjs`.
- Generate `src/services/clockify/generated/reports.ts` from the report-only spec.
- Export `createClockifyClient(baseUrl, options)`, `createClockifyReportsClient(baseUrl, options)`, `clockify`, and `clockifyReports` from `src/services/clockify/client.ts`.
- Configure auth by attaching `X-Api-Key` from the native auth bridge before Clockify requests.
- Keep regional and subdomain base URL selection outside the generated client so it can be changed per workspace.

## Entry sync

`src/services/clockify/sync.ts` owns broad Clockify time-entry pagination. It syncs recent entries into a TanStack DB collection persisted through browser localStorage under `clockalong.clockify.timeEntries.v1`.

The synced row shape keeps the original Clockify entry plus local query fields: entry ID, workspace ID, user ID, started-at timestamp, and synced-at timestamp. UI code should query those indexed fields with TanStack DB live queries instead of repeatedly paging Clockify from routes or widgets.

`ClockifySyncProvider` mounts inside the frontend provider stack after `QueryClientProvider`. It resolves the authenticated Clockify user and active/default workspace, then runs the entry sync on the configured interval and whenever callers invalidate or refetch `queryKeys.clockify.entrySync()`.

The `clockifyEntrySyncDays` setting controls the lookback window. Current supported values are `5`, `15`, and `30`, with `30` as the default. Keep this setting as a UX/performance knob, not as a correctness boundary for the Clockify API client.

The `clockifyEntrySyncInterval` setting controls background sync frequency. Current supported values are `manual`, `5m`, `15m`, `30m`, and `1h`, with `30m` as the default. Manual mode still allows explicit refreshes through query refetches.

Direct `getTimeEntries` reads are still appropriate for tiny single-purpose reads, especially the active running timer with page size `1`. Any feature that needs broad recent completed entries should use the synced collection.

The reports generator uses a media-type expression that accepts Clockify's `*/*` report responses as JSON. Keep that logic in `scripts/generate-clockify-client.mjs`; do not put long generator pipelines directly in `package.json`.

The generated file is intentionally marked `// @ts-nocheck`. Clockify's OpenAPI spec currently produces a few circular type/default-value errors in the generated implementation. App code should import generated aliases, schemas, and exported types from concrete Clockify service modules or generated files, but should not manually edit the generated file.
