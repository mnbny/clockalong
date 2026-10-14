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
- Telegram is optional and supports QR login, two-step verification, session restore, and disconnect. Chat features are not included.
- Quick Timers are local presets for reusable timers that are not tied to another app.

## Authentication

Clockalong uses user-owned credentials:

- Clockify connects with a Clockify API key.
- Linear connects through OAuth with PKCE.
- GitHub connects with a fine-grained personal access token.
- Telegram connects by scanning a QR code with an existing account in the official Telegram phone app.

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

To prepare a new worktree with asdf, install the plugins listed in `.tool-versions`, then run:

```sh
scripts/worktree-setup.sh
```

This installs the toolchain and dependencies, copies missing base, development, and production env files from the primary Git worktree, and prebuilds the Rust backend. Existing local files are preserved. After pnpm is available, `pnpm run worktree:setup` runs the same setup.

Run the frontend dev server:

```sh
pnpm dev
```

Run the Tauri app:

```sh
pnpm run worktree:run
```

The runner accepts `WORKTREE_PORT`, `PASEO_PORT`, `CONDUCTOR_PORT`, `PASEO_WORKTREE_PORT`, or `PORT`, in that order, and defaults to `1420`. It forwards extra arguments to `tauri dev`. Both scripts work from Paseo, Conductor, or a terminal.

### Provider app configuration

Register Telegram at <https://my.telegram.org/apps> and use the client ID from your Linear OAuth application. For development, create the local configuration file once:

```sh
cp -n .env.development.example .env.development.local
```

Fill in the three blank values in `.env.development.local`, then use the normal Paseo Run action or `pnpm run worktree:run`. Both start the launcher, which loads the local values for Cargo automatically. Restart the app after changing them. Existing local files are preserved and ignored by Git.

The launcher uses Vite's standard development precedence: exported environment values, `.env.development.local`, `.env.development`, `.env.local`, then `.env`. It forwards only `CLOCKALONG_` values loaded from those files; the child still inherits the normal process environment. Direct `pnpm tauri dev` bypasses this launcher and does not load these files for Cargo.

For releases, create the production configuration file once:

```sh
cp -n .env.production.example .env.production.local
```

Fill in the provider app values, Apple notarization fields, signing identity, and updater key path. The file supports quoted values with spaces and `$HOME` expansion. Private key files stay at their specified paths; the launcher does not read their contents.

Then use `pnpm release:mac` or `pnpm release:github` normally. Both load Vite production env files, with this precedence: exported environment values, `.env.production.local`, `.env.production`, `.env.local`, then `.env`. File-loaded values are limited to `CLOCKALONG_`, `APPLE_`, and `TAURI_SIGNING_` prefixes. Development env files are not loaded. CLI arguments and piped GitHub release notes pass through unchanged.

Direct `pnpm tauri build` or direct shell-script invocation bypasses this launcher and requires exported values. The existing signing, notarization, and publishing flows remain unchanged.

Cargo embeds provider app values in the native app and rebuilds when they change. Packaged apps launched from Finder need no environment variables. The bundled app values remain extractable; local configuration keeps them out of source, not out of the distributed app. Do not use `VITE_*` variables for this configuration.

Linear uses PKCE without a client secret. Keep its existing registered callback URLs: `http://localhost:53682/oauth/linear/callback`, `http://localhost:53683/oauth/linear/callback`, and `http://localhost:53684/oauth/linear/callback`. The existing `CLOCKALONG_LINEAR_REDIRECT_URI` override remains available for another registered URL.

Missing Telegram configuration disables its Connect button. Missing Linear configuration produces a clear connection error and leaves saved tokens untouched; startup does not refresh or schedule retries until the app is rebuilt with its client ID. Clockify remains the only required connection. Users authorize their own provider accounts and do not supply these app credentials.

Run only one Telegram-enabled Clockalong instance. Fully restart the app during Telegram auth development. Sharing a session between live instances can invalidate it. Sessions stay in native Stronghold storage; the client uses memory storage. Disconnect removes the local session first and attempts remote logout. If remote logout fails, terminate Clockalong from Telegram's Devices settings.

Credential-free lifecycle checks: `node --import tsx --test scripts/telegram-session.test.mjs`. A configured app and an authorized test account are required to verify QR scanning, two-step verification, and restart restore against Telegram.

Run formatting, linting, and type checks:

```sh
pnpm validate
```

Typecheck only:

```sh
pnpm validate:typecheck
```

Build the frontend:

```sh
pnpm build
```
