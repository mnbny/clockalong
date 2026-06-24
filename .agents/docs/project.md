# Project Brief

Clinear is a desktop app that connects Linear work tracking with Clockify time tracking. The app should make it fast to
see assigned Linear tickets, start and stop time against individual tickets, review time already tracked per ticket, and
eventually reason about how much time should be billed for each feature or ticket.

The initial product goal is not project management or invoicing. It is a focused personal workflow for turning Linear
issues into accurate, reviewable Clockify time entries.

## Core Workflow

- Authenticate with Linear.
- Authenticate with Clockify. Current assumption: Clockify may require API key-based authentication, but this needs
  separate research before implementation.
- Show Linear tickets assigned to the current user.
- Let the user start and stop Clockify timers for specific Linear tickets.
- Sum tracked Clockify time by Linear ticket so the user can see how much time has accumulated on each piece of work.
- Support useful ordering such as recently clocked, currently active, or assigned ticket priority once the data model is
  known.

## Billing Context

The user bills hourly but often bills according to delivered value rather than raw elapsed time. Some work spans multiple
Linear tickets, and some small implementation tasks can reasonably map to more billable time because the value delivered
is higher than the wall-clock duration.

Longer term, Clinear should help reconcile tracked work with billable time. The likely direction is an LLM-assisted
review flow that can look at tickets, tracked time, and context, then propose how much time to bill or how to distribute
billable time across related tickets. That billing intelligence is future scope and should not be implemented until the
base Linear/Clockify workflow is solid.

## Near-Term Boundary

- Keep implementation focused on infrastructure and product scaffolding until the API/auth research is complete.
- Do not add real Linear or Clockify integration code without explicit direction.
- Avoid Streamlink-derived or unrelated domain concepts.
- Placeholder UI is acceptable when it proves app shell, styling, navigation, and Tauri boot behavior.
- Preserve the current Tauri, React, pnpm, Conductor, and agent-doc conventions unless a specific product requirement
  needs a change.

## Open Research

- Linear authentication flow and required scopes.
- Clockify authentication method, API key handling, and workspace/project/task model.
- Local storage requirements for tokens, selected workspaces, issue mappings, recent timers, and preferences.
- Whether Clinear should create Clockify projects/tasks from Linear data or only attach time entries with Linear issue
  metadata.
- How to represent value-based billable time separately from raw tracked time.
