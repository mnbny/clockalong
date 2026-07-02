# Project brief

Clinear is a developer-focused Clockify companion. Clockify is the system of record for time entries. Clinear makes it faster to start, stop, classify, review, and reconcile time from the work sources developers already use.

The app is opinionated around personal developer billing and time review. It is not a general project-management client, a Clockify replacement, or an invoicing system.

## Product model

- Clockify is the core integration. It owns workspaces, projects, timers, reports, and persisted time entries.
- Work sources provide context that can become Clockify time-entry descriptions, links, grouping, matching, and review metadata.
- External work-source providers include tools such as Linear and, later, GitHub.
- Local work sources include Quick Timers and other app-owned ad hoc presets.
- Provider-specific behavior should stay provider-specific until multiple real sources prove a shared abstraction is useful.

Vocabulary:

- Work source: anything that can produce trackable work, such as Linear, GitHub, or Quick Timers.
- Trackable work item: a provider or local item that can start a Clockify timer.
- Time-entry context: metadata used to build descriptions, links, grouping, matching, and review.
- Review surface: UI for inspecting, repairing, and eventually reconciling raw Clockify entries.

## Core workflow

- Authenticate with Clockify using a user-provided API key stored through native secure storage.
- Connect one or more work sources, starting with Linear and Quick Timers.
- Show relevant trackable work items from connected sources.
- Let the user start and stop Clockify timers from those work items.
- Build useful Clockify descriptions from the selected source's context.
- Sum and review tracked Clockify time by source item where matching is possible.
- Support useful ordering such as currently running, recently clocked, active work, and recently updated.

## Current sources

- Clockify: required core time-tracking provider.
- Linear: existing external provider for assigned issues and issue-based time tracking.
- Quick Timers: existing local source for reusable ad hoc Clockify timers that do not depend on external work data.
- GitHub: planned external provider for pull-request-centered developer billing and review workflows. Research has not been completed yet.

## Billing context

The user bills hourly but often bills according to delivered value rather than raw elapsed time. Some work spans multiple source items, and some small implementation tasks can reasonably map to more billable time because the value delivered is higher than the wall-clock duration.

Longer term, Clinear should help reconcile tracked work with billable time. A later review flow may use an LLM to look at Clockify entries plus source context from Linear, GitHub, Quick Timers, and future sources, then propose how much time to bill or how to distribute billable time across related work. That billing intelligence is future scope and should wait until the Clockify core and source-specific tracking workflows are solid.

## Near-term boundary

- Keep new work focused on Clockify companion workflows: tracking, review, source context, and billing-adjacent reconciliation.
- Avoid turning Clinear into a broad Linear, GitHub, project-management, or invoicing client.
- Avoid Streamlink-derived or unrelated domain concepts.
- Placeholder UI is acceptable for product areas that are not wired yet, but provider auth should use real native flows once a provider is implemented.
- Preserve the current Tauri, React, pnpm, Conductor, and agent-doc conventions unless a specific product requirement needs a change.

## Open research

- How GitHub should authenticate and which GitHub work items should appear first.
- How GitHub pull requests, reviews, comments, and review requests should map to Clockify descriptions and review surfaces.
- Whether Clinear should support more than one default Clockify project or workspace, and whether task mapping is worth adding after the default-project flow proves out.
- Whether Clinear should ever create Clockify projects/tasks from source data or only attach source metadata to selected Clockify projects through descriptions and links.
- How to represent value-based billable time separately from raw tracked time.
