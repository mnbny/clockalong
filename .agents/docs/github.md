# GitHub

GitHub supplies repository issues and pull requests as trackable work. Clockalong reads their context and tracks time in Clockify. It does not provide repository administration or a pull-request review editor.

The frontend uses Octokit. Native authentication owns the user-supplied token. Repository access remains subject to the token's permissions and organization policy.

## Sync scope

Settings select repositories and enabled work-item types. Repository choices are applied explicitly. Sync fetches open issues, open pull requests, and recently updated closed pull requests within that scope.

The fetch limit applies separately to each repository, type, and state. Open pull requests include drafts. Direct mentions and pending direct review requests supply additional targeted results. Team review requests and past participation are not inferred as involvement.

A successful sync stores fetched rows and removes excluded repositories or types together. Rows outside a capped fetch remain as last-known data. Reads apply the selected scope even before cleanup finishes.

Background intervals and explicit refresh control synchronization. Dashboard author, label, mention, and closed-item filters do not change the fetch scope.

## Dashboard

The widget displays at most 15 matching work items per page, ordered by update time with stable item ordering. Previous and Next move through the saved results.

Author, label, and Mentions filters are additive: matching any active filter includes the item. The connected viewer is always a selected author. Additional authors and selected labels persist independently of the current cache.

Label choices come from the selected repositories' label catalogs. Matching uses normalized label names across repositories. Mentions includes direct mentions and pending direct review requests.

Show all bypasses author, label, and Mentions filters. Closed-item visibility remains a separate control.

Rows show source context, tracked time, and rate-derived value. Users can control Clockify timers, add completed time, or open the original item.

## Entry descriptions

Issues and pull requests have separate templates and missing-value fallbacks. Branch variables belong only to pull requests.

Internal references identify the repository, item type, and number. Clockify descriptions retain these markers so tracked summaries can match the source item.
