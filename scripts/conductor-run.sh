#!/bin/sh
set -eu

APP_PORT="${CONDUCTOR_PORT:-${PORT:-1420}}"

case "$APP_PORT" in
  '' | *[!0-9]*)
    echo "Invalid port: $APP_PORT" >&2
    exit 1
    ;;
esac

TAURI_CONFIG=$(printf '{"build":{"devUrl":"http://localhost:%s","beforeDevCommand":"pnpm dev --port %s --strictPort"}}' "$APP_PORT" "$APP_PORT")

echo "Starting Tauri dev server on http://localhost:$APP_PORT"
exec pnpm tauri dev --config "$TAURI_CONFIG" "$@"
