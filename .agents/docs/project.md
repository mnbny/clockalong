# Project

Clinear is currently a neutral Tauri app scaffold.

The first milestone is infrastructure parity with the reference app: a runnable desktop shell, shared tooling,
Conductor scripts, frontend conventions, Rust/Tauri wiring, and agent-facing docs. Product-specific behavior has not
been selected yet.

## Current Boundary

- Keep the app domain-neutral until product direction is defined.
- Preserve the app shell layout and development workflow.
- Do not add real feature flows, domain models, external integrations, or backend services without explicit direction.
- Placeholder UI is acceptable only when it proves the shell, styling, navigation, and Tauri boot path.
