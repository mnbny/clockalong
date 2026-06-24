#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="aarch64-apple-darwin"
APP_NAME="Clinear"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('${ROOT_DIR}/src-tauri/tauri.conf.json', 'utf8')).version")"
DMG_DIR="${ROOT_DIR}/src-tauri/target/${TARGET}/release/bundle/dmg"
DMG_PATH="${DMG_DIR}/${APP_NAME}_${VERSION}_aarch64.dmg"

APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Yulian Glukhenko (XRRAJG7BU8)}"
TAURI_SIGNING_PRIVATE_KEY_PATH="${TAURI_SIGNING_PRIVATE_KEY_PATH:-${HOME}/.tauri/clinear-updater.key}"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

require_env() {
  local name="$1"

  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"

  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Missing required command: ${name}" >&2
    exit 1
  fi
}

require_env "APPLE_API_ISSUER"
require_env "APPLE_API_KEY"
require_env "APPLE_API_KEY_PATH"
require_env "TAURI_SIGNING_PRIVATE_KEY_PATH"
require_command "pnpm"
require_command "xcrun"
require_command "spctl"
require_command "hdiutil"

if [[ ! -f "${APPLE_API_KEY_PATH}" ]]; then
  echo "APPLE_API_KEY_PATH does not point to a file: ${APPLE_API_KEY_PATH}" >&2
  exit 1
fi

if [[ ! -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]]; then
  echo "TAURI_SIGNING_PRIVATE_KEY_PATH does not point to a file: ${TAURI_SIGNING_PRIVATE_KEY_PATH}" >&2
  exit 1
fi

export APPLE_SIGNING_IDENTITY
export TAURI_SIGNING_PRIVATE_KEY_PATH
export TAURI_SIGNING_PRIVATE_KEY="$(cat "${TAURI_SIGNING_PRIVATE_KEY_PATH}")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD

cd "${ROOT_DIR}"

echo "Building ${APP_NAME} ${VERSION} for ${TARGET}"
echo "Signing identity: ${APPLE_SIGNING_IDENTITY}"

pnpm typecheck
env \
  -u APPLE_API_ISSUER \
  -u APPLE_API_KEY \
  -u APPLE_API_KEY_PATH \
  -u APPLE_ID \
  -u APPLE_PASSWORD \
  -u APPLE_TEAM_ID \
  pnpm tauri build --bundles app,dmg --target "${TARGET}"

if [[ ! -f "${DMG_PATH}" ]]; then
  echo "Expected DMG was not created: ${DMG_PATH}" >&2
  exit 1
fi

echo "Submitting DMG for notarization: ${DMG_PATH}"
xcrun notarytool submit "${DMG_PATH}" \
  --key "${APPLE_API_KEY_PATH}" \
  --key-id "${APPLE_API_KEY}" \
  --issuer "${APPLE_API_ISSUER}" \
  --wait

echo "Stapling notarization ticket"
xcrun stapler staple -v "${DMG_PATH}"

echo "Validating stapled DMG"
xcrun stapler validate -v "${DMG_PATH}"
spctl -a -vvv -t install "${DMG_PATH}"
hdiutil verify "${DMG_PATH}"

echo "Release artifact ready:"
echo "${DMG_PATH}"
