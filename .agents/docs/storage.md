# Storage

Frontend settings use `src/services/storage/`.

The storage service wraps `@tauri-apps/plugin-store` and falls back to defaults outside Tauri so the app can render in
browser-based Vite development. Keep stored values small, serializable, and versioned when changing shape.

## Keys

- `theme`: active daisyUI theme and native window appearance.
- `linearAuthConnected`: placeholder native marker for Linear auth state.
- `clockifyAuthConnected`: placeholder native marker for Clockify auth state.
