# Tauri

## Reactifying Rust Vars

Tauri managed state is not reactive by itself. Treat Rust as the owner of canonical app state, then expose
React-friendly hooks through a snapshot command plus a change event.

Use this pattern for Rust variables that the frontend should render reactively.

## Rust Contract

For each reactive Rust var, expose:

- a snapshot command for initial state
- an event emitted whenever the state changes

Command names should use snake case:

```txt
app_get_initialization_state
```

Event names should use scoped kebab case:

```txt
app:initialization-state-changed
```

Payloads must be serializable structs using `camelCase` for frontend compatibility.

## React Contract

Hooks should:

- return typed state
- call the snapshot command once on mount
- listen for the matching Tauri event
- ignore the initial snapshot result if an event arrives first
- clean up the event listener on unmount
- provide a non-Tauri fallback for browser/dev rendering
- use `createTauriReactiveStateHook` from `src/utils/createTauriReactiveStateHook.ts` for shared mechanics

Frontend-to-Rust bridge calls should be grouped by domain in `src/services/tauri/`.

## Auth gate

Rust owns the startup authentication snapshot. `src-tauri/src/clinear_auth.rs` reads provider credentials from
Stronghold during setup, validates or refreshes them as needed, emits `clinear-auth:state-changed`, and leaves app
initialization blocked until that native check completes.

Linear starts through the native OAuth command. Clockify uses a native API-key connection command that validates the key
before saving it. The frontend should keep route decisions tied to the native auth snapshot instead of trying to infer
auth state from local UI state.
