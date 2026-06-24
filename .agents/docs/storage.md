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
- `linearAuthConnected`: placeholder native marker for Linear auth state.
- `clockifyAuthConnected`: placeholder native marker for Clockify auth state.
