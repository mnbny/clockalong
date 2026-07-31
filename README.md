<h1 align="center">Clockalong</h1>
<p align="center">Track Clockify time from the work you already have open.</p>

<p align="center">
  <img width="480" height="480" alt="image" src="https://github.com/user-attachments/assets/22e68535-0e6f-49fc-8782-01d5fb33eb0e" />
</p>

Clockalong is an independent macOS desktop app for people who track time in Clockify while doing work across Linear, GitHub, and ad hoc tasks.

Clockify stays in charge of the time entries. Clockalong gives you a smaller, faster place to start timers, stop timers, add useful context, and review recent work without opening a full project-management app.

## What it does

- Connect Clockify with your own API key.
- Start and stop Clockify timers from Linear issues, GitHub issues and pull requests, or local Quick Timer presets.
- Build Clockify descriptions from the selected issue, pull request, or preset.
- Match Clockify entries back to the work they came from.
- See running timers, recent activity, totals, and estimated value where Clockify has enough data.
- Review recent Clockify entries and repair overlapping completed entries.
- Keep recently tracked non-terminal Linear work near the top under relevance sorting.
- Filter GitHub dashboard work by multiple authors or temporarily show all synced work.
- Keep provider credentials in native secure storage instead of browser local storage.

## Integrations

- Clockify is required and keeps the actual time entries.
- Linear can show assigned issues and start issue-based timers.
- GitHub can show selected repositories, issues, and pull requests, with persisted multi-author dashboard filtering.
- Quick Timers are local presets for reusable timers that are not tied to another app.

## Authentication

Clockalong uses user-owned credentials:

- Clockify connects with a Clockify API key.
- Linear connects through OAuth with PKCE.
- GitHub connects with a fine-grained personal access token.

Clockalong stores long-lived credentials in native secure storage. It only pulls out a working credential when it needs to talk to a connected service.

## Status

Clockalong is currently focused on personal time tracking and billing review:

- Fast timer control from the work sources you already use.
- Descriptions that make Clockify entries easier to review later.
- Recent-entry review and repair tools.
- Local dashboard caches so the app can stay quick.

It is not intended to replace Clockify, manage projects, generate invoices, or become a full Linear or GitHub client.

Clockalong is not affiliated with or endorsed by Clockify or CAKE.com.

## Development

Requirements:

- Node.js 20.19 or newer
- pnpm 11.1 or newer
- Rust 1.93 or newer

Install dependencies:

```sh
pnpm install
```

Run the frontend dev server:

```sh
pnpm dev
```

Run the Tauri app:

```sh
pnpm tauri dev
```

Typecheck:

```sh
pnpm typecheck
```

Build the frontend:

```sh
pnpm build
```
