<p align="center">
  <img width="360" alt="Clockalong logo" src="https://github.com/user-attachments/assets/7227bf3f-9ccb-4a81-8bd3-6ed619b94019" />
</p>

<h1 align="center">Clockalong</h1>
<p align="center">A Clockify Companion App</p>

Clockalong is an independent desktop companion app for Clockify. It helps you start, stop, and review Clockify timers from the work sources you already use, including Linear, Quick Timers, and future providers such as GitHub.

Clockify stays the system of record for time entries. Clockalong sits beside it as a focused workspace for source-linked time tracking, billable time review, and faster timer control.

## What Clockalong does

- Connects to Clockify with your own API key.
- Pulls in trackable work from optional sources such as Linear.
- Starts and stops Clockify timers from tickets, presets, and future provider items.
- Builds useful Clockify descriptions from source context.
- Shows tracked time, recent activity, and rate-derived value where Clockify data supports it.

## Current integrations

- Clockify is the required time tracking provider and source of truth for time entries.
- Linear is an optional work source for assigned issues and issue-based Clockify timers.
- Quick Timers are local presets for ad hoc Clockify timers that are not tied to an external provider.
- GitHub is a planned work source for pull request tracking, review work, and billing review.

Clockalong is not affiliated with or endorsed by Clockify or CAKE.com.

## Development

Requirements:

- Node.js LTS
- pnpm 11
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
