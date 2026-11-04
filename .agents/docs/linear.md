# Linear

Linear supplies issues assigned to the connected user as trackable work. Clockalong reads issue context and creates Clockify time entries; it does not edit Linear issues or provide a general workspace browser.

The frontend uses the official Linear TypeScript SDK, including focused GraphQL queries for compact issue records. Rust owns OAuth and credentials.

## Sync scope

Sync fetches assigned issues across workflow states for a verified viewer. Settings control the fetch limit, created-date or updated-date ordering, and background interval. These settings control incoming data, not the size or order of the displayed list.

A complete valid fetch stores its results together. Older rows outside the fetch limit remain as last-known data and may no longer be assigned. Empty responses retain those rows. Failed, partial, or mixed-viewer responses cannot replace the cache.

A session must verify its viewer before displaying saved issues. An established viewer remains available after a transient fetch failure. A fresh offline launch cannot establish that identity from the cache alone.

## Dashboard

The widget shows all saved issues matching its filters in one sorted list, without pagination. By default, it hides completed, canceled, duplicate, and unknown workflow types. Show all includes them without changing synchronization.

Relevance sorting puts the running issue first, then recently tracked open issues, followed by other active work and terminal issues. Recent tracking uses Clockify activity within seven days. Terminal issues receive no recency boost.

Other sorting choices use status, created date, updated date, or title. Workflow type and position preserve meaningful status ordering. Status badges use Linear's color with a contrasting foreground.

Rows combine issue context with Clockify tracked time and value. Users can start or stop a timer, add completed time, or open the issue in Linear.

## Entry descriptions

Linear settings own the issue description template and missing-value fallback. Available variables come from the compact assigned-issue record. Creating an entry does not require fetching full issue details.

Internal references identify the workspace and issue for Clockify matching. Displayed tracking summaries remain Clockify-derived rather than Linear-owned data.
