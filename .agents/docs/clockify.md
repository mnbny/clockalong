# Clockify integration notes

Clockify's regular REST API uses user-owned API keys. Clinear treats Clockify as a user-authorized external service, not as an OAuth provider with a shippable app credential.

Rust owns Clockify credential storage and auth state. Clockify API calls stay in the frontend. When the TypeScript client needs to call Clockify, it asks Rust for the validated API key and keeps that key in memory only.

## Primary references

- API docs: https://docs.clockify.me/
- OpenAPI spec: https://docs.clockify.me/openapi.json
- API key management: https://app.clockify.me/manage-api-keys
- Official API examples: https://github.com/clockify/api-examples

## Authentication

- Public REST API calls authenticate with the `X-Api-Key` header.
- Users generate API keys from their Clockify profile settings.
- API keys are user credentials and should not be shipped with Clinear.
- Clockify does not document an OAuth or PKCE flow for normal REST API consumers.
- Clinear should ask each user for their own Clockify API key and store it through native secure storage, not the Tauri JSON store.
- Rust should handle saving, reading, validating, and clearing the key. The broader Clockify API client belongs in the frontend.
- Validate a saved key by calling `GET /v1/user`.
- Startup validation should mark Clockify disconnected whenever validation does not succeed; Clinear does not support offline authenticated Clockify mode.
- Clear the saved key only when validation clearly fails because the credential is invalid or revoked. Keep the saved key after network or provider failures so the app can retry without asking the user to paste it again.
- Subdomain and regional workspaces may require a workspace-specific key or alternate base URL. Keep base URL handling configurable instead of hard-coding every request to the global host.

Clockify also has a CAKE.com Marketplace add-on model that uses `X-Addon-Token` and add-on scopes. That path is for marketplace add-ons embedded in or installed into Clockify workspaces. It is not the right auth model for Clinear's local Tauri desktop app.

## API shape

The API is broad and documented through Redoc plus an OpenAPI 3 spec. The endpoints most relevant to Clinear are:

- `GET /v1/user`: verify credentials and identify the current Clockify user.
- `GET /v1/workspaces`: list workspaces available to the key.
- `GET /v1/workspaces/{workspaceId}/projects`: list projects for mapping or selection.
- `GET /v1/workspaces/{workspaceId}/projects/{projectId}/tasks`: list tasks if Clinear maps Linear issues to tasks.
- `POST /v1/workspaces/{workspaceId}/time-entries`: create or start a time entry.
- `PUT /v1/workspaces/{workspaceId}/time-entries/{id}`: update a completed time entry, including overlap-repair start/end shifts.
- `GET /v1/workspaces/{workspaceId}/time-entries/status/in-progress`: inspect running timers in a workspace.
- `GET /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: read a user's time entries when entry-level data is needed, including dashboard per-ticket `Tracked` and `Total` summaries.
- `PATCH /v1/workspaces/{workspaceId}/user/{userId}/time-entries`: stop the currently running timer for a user.
- `POST /v1/workspaces/{workspaceId}/reports/detailed`: generate detailed reports for reconciliation.
- `POST /v1/workspaces/{workspaceId}/reports/summary`: generate grouped summaries.

Clockify reports use a separate base URL from regular API calls:

- Regular API: `https://api.clockify.me/api`
- Reports API: `https://reports.api.clockify.me`

The public OpenAPI spec includes report paths and path-level report servers. Keep reports on a separate app client so the regular API base URL does not leak into report requests.

Clockify permissions follow the authenticated user's Clockify role and workspace access. Clinear should assume a normal user key can manage that user's own timer and time entries. Admin-style workspace operations may fail unless the user has the required Clockify role.

## Entry descriptions

Clinear builds Clockify time-entry descriptions from the user-configured Linear issue template in `src/services/clockify/description-template.ts`.

- Default template: `{identifier}: {title}`.
- Template variables use single braces and must be explicitly listed by `ClockifyDescriptionTemplateToken`.
- The settings UI exposes the v1 token set that belongs in Clockify descriptions.
- Missing, `null`, `undefined`, and empty string values use the configured fallback.
- The default fallback is `n/a`; numeric `0` remains a real value.
- Template and fallback preferences are stored through `useStorage` as `clockifyDescriptionTemplate` and `clockifyDescriptionTemplateFallback`.
- Timer creation should format from the assigned-issue list DTO when possible. Do not fetch full issue details only to build the Clockify description.
- New time entries should use the `clockifyBillable` storage preference for their initial billable flag. The default is billable.

## Client strategy

Clockify does not publish an official TypeScript or Rust SDK for the API-key workflow. Clinear uses Zodios for the frontend Clockify API client, following the generated-client pattern from `~/Dev/polybot-v2/api`.

- `clockify/api-examples` is official and works as request reference, but it is not a maintained SDK.
- `clockify/addon-java-sdk` is official for CAKE.com Marketplace add-ons, not Clinear's desktop flow.
- `clockifixed` is a newer third-party TypeScript wrapper generated from the OpenAPI spec, with Zod validation.
- `clockify-ts` is an older third-party TypeScript wrapper.

Clinear implementation:

- Keep the Clockify API client in the frontend.
- Generate a Zodios client from Clockify's OpenAPI spec with `openapi-zod-client`.
- Use `@zodios/core`, `axios`, and the generated Zod schemas/types for request and response typing.
- Keep Rust limited to authentication/token responsibilities: secure key storage, auth-state initialization, validation, clearing credentials, and token/key retrieval according to the app's chosen bridge contract.
- Do not build a Rust Clockify API client.

## Zodios setup

Use `~/Dev/polybot-v2/api` as the local reference, but keep Clinear as a single app repo. Do not create workspace packages or an `api/` package here.

The Clinear setup lives under `src/services/clockify/`:

- `specs/clockify-openapi.json`: downloaded Clockify OpenAPI spec.
- `specs/clockify-reports-openapi.json`: generated report-only spec derived from the official Clockify spec.
- `generated/clockify.ts`: generated Zodios client and exported schema/type definitions.
- `generated/reports.ts`: generated Zodios client for Clockify's reports host.
- `client.ts`: app-facing client factories and default client instances.
- `projects.ts`: project-list helpers for selecting the default Clockify project.
- `ticket-summaries.ts`: dashboard aggregation of linked Clockify time entries by Linear issue.

Polybot reference points:

- `api/package.json`: has a `generate` script that runs `openapi-zod-client ... -o src/*.ts`, depends on `@zodios/core`, `axios`, `zod`, and `openapi-zod-client`.
- `api/specs/`: stores source OpenAPI specs.
- `api/src/*.ts`: generated files export `schemas`, `api`, and `createApiClient(baseUrl, options)`.
- `api/src/api.ts`: creates concrete clients with known base URLs and shared `axiosConfig`.

For Clinear, adapt that pattern to Clockify:

- Regenerate with `pnpm clockify:generate`.
- Fetch the spec from `https://docs.clockify.me/openapi.json`.
- Generate `src/services/clockify/generated/clockify.ts`.
- Prepare the report-only spec with `scripts/prepare-clockify-specs.mjs`.
- Generate `src/services/clockify/generated/reports.ts` from the report-only spec.
- Export `createClockifyClient(baseUrl, options)`, `createClockifyReportsClient(baseUrl, options)`, `clockify`, and `clockifyReports` from `src/services/clockify/client.ts`.
- Configure auth by attaching `X-Api-Key` from the native auth bridge before Clockify requests.
- Keep regional and subdomain base URL selection outside the generated client so it can be changed per workspace.

The reports generator uses a media-type expression that accepts Clockify's `*/*` report responses as JSON. Keep that logic in `scripts/generate-clockify-client.mjs`; do not put long generator pipelines directly in `package.json`.

The generated file is intentionally marked `// @ts-nocheck`. Clockify's OpenAPI spec currently produces a few circular type/default-value errors in the generated implementation. App code should import generated aliases, schemas, and exported types from concrete Clockify service modules or generated files, but should not manually edit the generated file.
