# Tauri

## Startup appearance

Clockalong reads the saved theme and applies its palette and native light or dark appearance before the frontend renders. The window stays hidden until the themed app shell mounts. Provider authentication and synchronization proceed independently.

All bundled daisyUI themes are available in Light and Dark groups. The header palette icon and App settings use native selects. The theme shortcut focuses the header select. Missing or unsupported selections use Halloween. The theme upgrade resets existing selections to Halloween once. Later selections persist.

Theme changes update the app palette, dark appearance styles, and native window appearance together. The shell and Quick Timer cards use theme surface colors.

## Reactifying Rust Vars

Tauri managed state is not reactive by itself. Treat Rust as the owner of canonical app state, then expose React-friendly hooks through a snapshot command plus a change event.

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
- use `createTauriReactiveStateHook` from `src/utils/create-tauri-reactive-state-hook.ts` for shared mechanics

Frontend-to-Rust bridge calls should be grouped by domain in `src/services/tauri/`.

## Updates

Clockalong uses Tauri's updater plugin for direct-download macOS updates. The updater is not automatic UI; frontend code must call the plugin and decide how to notify or install.

- Updater configuration lives in `src-tauri/tauri.conf.json`.
- Rust plugin initialization lives in `src-tauri/src/lib.rs`.
- Frontend updater calls are wrapped in `src/services/tauri/app-updates.ts`.
- `src/hooks/useAppUpdates.tsx` owns app-wide periodic update checks and update-available toasts.
- `src/components/AppSettings.tsx` owns the manual update check/install/restart UI rendered from the settings route.
- Do not auto-install or auto-restart. Active time tracking should stay user-controlled.

## macOS menu bar

`src/hooks/useMenuBar.ts` owns the status item, active-timer title, native menu, and menu actions. It reads recent completed entries from the synced Clockify collection, retains the newest entry for each displayed title, then shows the five newest unique entries. `src/services/clockify/time-entries.ts` contains the shared start and stop behavior. `src-tauri/icons/menu_icon_64x64.png` is the macOS template icon. `menuBarVisible` persists the App settings toggle.

On macOS, closing the main window hides it so the status item and timer remain available. The Dock restores the hidden window, while the native menu's Quit item explicitly exits the app.

## Downloads

Telegram attachment downloads use a narrow native writer for the system Downloads folder. The frontend supplies a filename and streams binary chunks through an opaque transfer handle. Rust owns filename restrictions, collision handling, completion checks, and partial-file cleanup. It accepts no arbitrary destination path and grants no general frontend filesystem access.

File work runs off the main thread. Normal app exit waits for partial-file cleanup. Hiding the macOS window leaves active transfers running.

The Telegram media viewer uses a separate native writer and an isolated temporary directory. Native code generates all paths and limits asset-protocol access to that directory. The viewer downloads a complete file before playback. It detaches the media source before release. Closure and scope teardown release temporary files.

Normal exit removes registered files, and startup removes crash leftovers. Completed Downloads remain separate user files.

Small Telegram avatars and previews use a separate persistent native image cache. Rust owns paths, storage limits, eviction, and access handles. Reads and writes use bounded binary IPC and run off the main thread. Restoring the same group retains completed images and removes partial writes. Unlink and disconnect invalidate handles and delete cached images. The frontend cannot select filesystem paths or reuse invalidated handles.

MCP attachment sends use a separate native reader. Rust retains the caller's absolute path with the pending send request. The frontend receives only a filename and can claim bounded binary bytes once through the request identifier. Reads accept nonempty regular files of at most 20 MiB and run off the main thread. Completed or expired requests cannot claim files. This does not grant the frontend arbitrary path access.

## Auth gate

Rust owns the public authentication snapshot. Native startup validates Clockify before app initialization completes. Linear and GitHub checks run independently and do not block initialization.

Telegram performs MTProto authentication in the frontend. Its provider waits for native initialization before restore, because startup replaces the initial auth snapshot. Rust owns Telegram session storage and connected-state events. Telegram failure does not block the app or change the Clockify route gate.

Linear uses native OAuth. Clockify and GitHub use native credential validation. Frontend route decisions use the native auth snapshot.
