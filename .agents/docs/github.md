# GitHub provider

GitHub is a planned external work-source provider for developer-focused Clockify tracking and review. The current product bet is pull-request-centered billing: authored pull requests, review requests, pull-request feedback, and related developer work that should become accurate Clockify time entries.

This provider has not been researched or designed yet. Do not make implementation decisions from this placeholder.

## Research needed

- Authentication model for a local Tauri desktop app.
- Whether to use GitHub OAuth, GitHub Apps, fine-grained personal access tokens, or another model.
- Which initial work items should appear: authored pull requests, assigned review requests, commented pull requests, reviewed pull requests, issues, or some narrower subset.
- How GitHub work items should map to Clockify descriptions and links.
- Whether matching existing Clockify entries should use pull-request numbers, URLs, branch names, commit SHAs, or explicit local metadata.
- How pull-request review activity should be summarized for billing review.
- Which official APIs, SDKs, scopes, rate limits, and webhook limitations matter for a local desktop app.

## Product constraints

- GitHub should be a work-source provider, not a general GitHub client.
- Keep Clockify as the system of record for time entries.
- Start with pull-request billing and review workflows before expanding to broad repository or issue browsing.
- Do not add GitHub-specific code or UX until the authentication and API strategy has been researched.
