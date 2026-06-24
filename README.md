# Clinear

Clinear is a desktop app for tracking time against Linear issues in Clockify.

It is built for a narrow workflow: pull in the Linear issues assigned to you, start or stop a Clockify timer from a ticket,
and see how much time has been tracked for that work.

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
