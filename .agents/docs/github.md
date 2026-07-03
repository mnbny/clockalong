# GitHub provider

GitHub is an external work-source provider for Clockify tracking and review. The first workflow is pull-request-centered billing: authored pull requests, review requests, pull-request feedback, and related work that should become accurate Clockify time entries.

GitHub currently supports PAT authentication, repository selection, work-item sync, settings, dashboard display, Clockify timer start/stop, and Clockify tracked-summary matching through internal refs. PR review-comment workflows are not implemented yet.

## Primary references

- Personal access tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- Fine-grained PAT permissions: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
- REST authentication: https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api
- Pull request REST permissions: https://docs.github.com/en/rest/pulls/pulls
- Pull request review comment REST permissions: https://docs.github.com/en/rest/pulls/comments
- Octokit JavaScript SDK: https://docs.github.com/en/rest/guides/scripting-with-the-rest-api-and-javascript
- GitHub App versus OAuth App: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps
- GitHub App user access tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- OAuth App authorization: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

## Recommendation

GitHub uses user-provided personal access tokens.

This fits Clockalong's current product shape better than a registered GitHub App:

- Clockalong is a local-first desktop companion, not a hosted service.
- Users keep control of the credential and can revoke it directly from GitHub.
- No GitHub App needs to be installed on organizations or repositories.
- Organization owners do not see Clockalong as an installed integration.
- The implementation mirrors Clockify's API-key model: user provides credential, Rust validates and stores it securely, frontend uses an in-memory working token for API calls.
- A PAT can cover the user's actual working surface without forcing the app/repository installation boundary that GitHub Apps impose.

Use fine-grained PATs. Do not present classic PATs as a normal option in the UI.

This is a privacy-oriented product choice, not the most polished SaaS integration choice. The tradeoff is that users must create and paste a token manually.

## Fine-grained PAT

Fine-grained PATs are the recommended path in UI copy and docs.

Recommended permissions:

- Repository access: selected repositories or all repositories the user chooses.
- Metadata: read.
- Issues: read.
- Pull requests: read.

This should be enough for basic private issue, pull-request, and pull-request review-comment reads through REST endpoints. Reassess once the actual PR query plan is designed, especially if GraphQL search or richer issue metadata needs additional permissions.

Fine-grained PAT caveats:

- They may require organization approval.
- Organization policy may force expiration or block access.
- They may not cover every cross-organization workflow the user expects.
- They require the user to choose a resource owner and repository access shape.

Do not request or recommend classic PATs, write scopes, or admin scopes.

## Rejected defaults

Do not replace the current PAT flow with a GitHub App by default.

GitHub Apps are technically cleaner for public integrations because they use fine-grained permissions, repository installation boundaries, and short-lived user access tokens. The downside for Clockalong is product friction and visibility: the app must be installed on accounts or organizations, organization admins can see and manage it as an integration, and the app can only access resources that both the user and app installation can access.

That model may be right later if Clockalong becomes a more formal public integration, but it is not the best first pass for a local, user-controlled desktop companion.

Do not replace the current PAT flow with an OAuth App by default.

OAuth Apps support a smoother browser redirect flow, including loopback redirect URLs for desktop apps. The permission model is still broad for private repository access, often pushing toward `repo`, and there is no meaningful privacy advantage over PATs for Clockalong's local app model.

Do not use GitHub webhooks for the initial local app.

Webhooks require a reachable HTTPS endpoint. Clockalong is currently local-only, so polling and explicit refresh are the right path.

## Native auth flow

Rust should own GitHub credential validation, storage, clearing, and auth-state events.

Recommended flow:

1. User clicks `Connect GitHub`.
2. Frontend opens a small dialog with a normal text input for a GitHub token.
3. Dialog links to GitHub token creation/settings pages.
4. User pastes a fine-grained PAT.
5. Frontend calls `clockalong_auth_connect_github`.
6. Rust validates the token with `GET https://api.github.com/user`.
7. Rust may also perform a small permission probe once the first required endpoint is known.
8. If validation succeeds, Rust stores the token in Stronghold, emits `clockalong-auth:state-changed`, and the frontend shows a success toast.
9. If validation fails because the token is invalid or revoked, Rust does not store it and the frontend shows an error toast.

The token input should be a normal text input, not a password input, matching the Clockify API-key decision. Users should be able to inspect what they pasted before submitting.

Do not store GitHub tokens in Tauri store, browser localStorage, route state, logs, or broad frontend state.

## Token lifecycle

PATs do not have a refresh flow controlled by Clockalong.

Keep behavior simple:

- Store the token in Stronghold.
- Keep the public auth snapshot simple: add `githubAuthenticated: boolean`.
- On startup, validate the stored token before marking GitHub authenticated.
- Treat clear `401 Bad credentials` style failures as invalid credentials: clear the stored token, mark GitHub disconnected, and emit an auth-state change.
- Treat transient network/provider failures as disconnected for the current check but keep the saved token for retry.
- If GitHub returns permission errors for a workflow, keep the token but surface that the token does not have enough access for that workflow.

Expose a narrow frontend credential bridge:

```ts
auth.getGithubCredential() -> { accessToken }
```

The frontend can use the access token in memory to create an Octokit client for GitHub REST or GraphQL calls. Do not persist the access token in frontend state, route state, localStorage, or logs.

## Disconnect

GitHub disconnect should remove local credentials and treat that as success.

The normal app action should:

- clear the GitHub token from Stronghold
- clear GitHub local read-model caches
- emit `clockalong-auth:state-changed`

Clockalong should not try to revoke PATs through GitHub. Users revoke or rotate PATs from GitHub settings.

## Frontend integration

GitHub should behave like Linear as an optional provider:

- Clockify remains the only app-level auth gate.
- GitHub auth appears as an optional provider on the sign-in/provider connection screen.
- GitHub settings should gate on `useAppAuth().value.githubAuthenticated`.
- GitHub provider surfaces should render nothing or a connect prompt when unauthenticated.
- GitHub sync providers should not run unless GitHub is authenticated.

GitHub is part of the native auth state and frontend auth client. Keep GitHub data features behind `githubAuthenticated` and the provider credential bridge.

Expected native command shape:

- `clockalong_auth_connect_github`
- `clockalong_auth_disconnect_github`
- `clockalong_auth_get_github_credential`

No `refreshGithubCredential` command is needed for PAT-first auth.

`src/components/GitHubSettings.tsx` owns the first GitHub settings surface. When GitHub is disconnected it offers the same PAT connection flow as the sign-in screen. When connected, it uses TanStack Query plus Octokit to load repository candidates and store the dashboard allow-list in `githubSelectedRepositories`.

The repository selector uses daisyUI's `filter` pattern: checkbox inputs styled as small buttons. Keep this tag-like control for repo toggles unless the list becomes too large, in which case add more filtering before changing the interaction model.

GitHub entry descriptions are configured separately for issues and pull requests. Keep issue templates limited to issue-safe variables and keep pull-request branch variables on the pull-request template only. Include `{internal-ref}` in provider-backed templates so Clockify entries can be matched back to GitHub rows for tracked totals.

`src/services/github/sync.ts` owns GitHub work-item sync. It stores issues and pull requests in one local TanStack DB collection keyed by repository, item type, and number. Sync runs only while GitHub is authenticated, reads the selected repositories from `githubSelectedRepositories`, and respects `githubVisibleWorkItemTypes`. It fetches open issues, open pull requests, and recently updated closed pull requests per repository, sorted by updated time descending. Open pull requests include both draft and active pull requests. `githubWorkItemSyncLimit` caps each repository/type/state fetch, and `githubWorkItemSyncInterval` controls the background refresh cadence. If repositories or item types are removed from settings, the next sync removes matching local rows from the GitHub work-item cache.

Closed pull requests are synced so recently completed review and build work can still show tracked totals. They stay hidden in the dashboard unless `githubShowClosedWorkItems` is enabled.

`src/components/GitHubWidget.tsx` owns the first GitHub dashboard surface. It gates on GitHub authentication, subscribes to the local GitHub work-item collection, exposes a header toggle for the `githubAuthoredWorkItemsOnly` display filter, exposes a refresh action for the GitHub and Clockify syncs, merges Clockify tracked summaries into the table, and starts or stops Clockify timers with the same control pattern as Linear. Keep broad GitHub reads inside the sync provider rather than fetching GitHub directly from the widget.

Default issue description:

```text
Issue#{number} - {repository}: {title} [{internal-ref}]
```

Default pull request description:

```text
PR#{number} - {repository}: {title} - ({headBranch} -> {baseBranch}) [{internal-ref}]
```

`{internal-ref}` renders as `ref:github:{repository}:{type}:{number}`, where type is `issue` or `pr`.

Template storage keys are all GitHub-prefixed:

- `githubIssueDescriptionTemplate`
- `githubIssueDescriptionTemplateFallback`
- `githubPullRequestDescriptionTemplate`
- `githubPullRequestDescriptionTemplateFallback`

## API client direction

Use Octokit in the frontend. GitHub recommends Octokit.js for JavaScript REST API usage, and Octokit can also call GraphQL.

The current client helper is `src/services/github/client.ts`. It returns an authenticated `@octokit/rest` client using the in-memory token from `auth.getGithubCredential()`. Keep broad API calls in settings/widgets for now; extract provider service modules only when multiple surfaces need the same GitHub request logic.

Rust should not become a general GitHub API proxy. Its GitHub role should match Clockify's native role more than Linear's refresh-heavy role: secure storage, validation, clearing, auth-state events, and returning a working token to the frontend on demand.

## Open checks

- Decide whether GitHub account identity should stay native-only or expose login/avatar in the public auth snapshot. Start with only `githubAuthenticated` unless the UI needs identity.
- Decide whether to add a one-click "open GitHub token settings" action for rotation/revocation.
- Decide whether richer PR review-comment reads need additional PAT guidance beyond Metadata read, Issues read, and Pull requests read.
