# Storage

Frontend settings use `src/services/storage/`.

The storage service wraps `@tauri-apps/plugin-store` and falls back to defaults outside Tauri so the app can render in
browser-based Vite development. Keep stored values small, serializable, and versioned when changing shape.

## Keys

- `compactRows`: temporary preference for dense list and table views.
- `defaultView`: temporary landing view preference for the app shell.
- `density`: temporary numeric UI density value.
- `desktopAlerts`: temporary preference for desktop notifications.
- `displayName`: temporary local display name used by settings UI previews.
- `theme`: active daisyUI theme and native window appearance.
- `refreshInterval`: temporary background refresh preference.

## Native secrets

Clockify stores the user API key in native Stronghold storage, not in the Tauri JSON store. Linear stores OAuth token
data in Stronghold as well. On startup, Rust reads those saved credentials and validates or refreshes them before setting
provider auth state.
