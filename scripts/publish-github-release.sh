#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="aarch64-apple-darwin"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('${ROOT_DIR}/src-tauri/tauri.conf.json', 'utf8')).version")"
TAG="v${VERSION}"
GITHUB_REPO="${GITHUB_REPO:-mnbny/clinear}"
DMG_PATH="${ROOT_DIR}/src-tauri/target/${TARGET}/release/bundle/dmg/Clinear_${VERSION}_aarch64.dmg"
MACOS_BUNDLE_DIR="${ROOT_DIR}/src-tauri/target/${TARGET}/release/bundle/macos"
MANIFEST_PATH="${ROOT_DIR}/src-tauri/target/${TARGET}/release/bundle/latest.json"
RELEASE_MODE="--draft"
RELEASE_NOTES_BODY="${RELEASE_NOTES:-}"
RELEASE_NOTES_PROVIDED="0"
RELEASE_NOTES_FILE=""

for arg in "$@"; do
  if [[ "${arg}" == "--publish" ]]; then
    RELEASE_MODE=""
  fi
done

if ! command -v gh > /dev/null 2>&1; then
  echo "Missing required command: gh" >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ -z "${RELEASE_NOTES_BODY}" && ! -t 0 ]]; then
  RELEASE_NOTES_BODY="$(cat)"
fi

if [[ -n "${RELEASE_NOTES_BODY//[[:space:]]/}" ]]; then
  RELEASE_NOTES_PROVIDED="1"
else
  RELEASE_NOTES_BODY="Clinear ${VERSION}"
fi

RELEASE_NOTES_FILE="$(mktemp)"
trap 'rm -f "${RELEASE_NOTES_FILE}"' EXIT
printf "%s\n" "${RELEASE_NOTES_BODY}" > "${RELEASE_NOTES_FILE}"

if [[ "${ALLOW_DIRTY_RELEASE:-}" != "1" && -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash changes before publishing, or set ALLOW_DIRTY_RELEASE=1." >&2
  exit 1
fi

scripts/release-mac.sh
MANIFEST_PATH="$(GITHUB_REPOSITORY="${GITHUB_REPO}" RELEASE_NOTES="${RELEASE_NOTES_BODY}" node scripts/generate-updater-manifest.mjs)"
UPDATE_BUNDLE="$(find "${MACOS_BUNDLE_DIR}" -maxdepth 1 -name '*.app.tar.gz' -print -quit)"
UPDATE_SIGNATURE="${UPDATE_BUNDLE}.sig"

if [[ ! -f "${DMG_PATH}" || ! -f "${UPDATE_BUNDLE}" || ! -f "${UPDATE_SIGNATURE}" || ! -f "${MANIFEST_PATH}" ]]; then
  echo "Missing one or more release artifacts." >&2
  exit 1
fi

if git rev-parse "${TAG}" > /dev/null 2>&1; then
  echo "Using existing tag ${TAG}"
else
  git tag "${TAG}"
  git push origin "${TAG}"
fi

if gh release view "${TAG}" --repo "${GITHUB_REPO}" > /dev/null 2>&1; then
  if [[ "${RELEASE_NOTES_PROVIDED}" == "1" ]]; then
    gh release edit "${TAG}" --repo "${GITHUB_REPO}" --notes-file "${RELEASE_NOTES_FILE}"
  fi
  gh release upload "${TAG}" "${DMG_PATH}" "${UPDATE_BUNDLE}" "${UPDATE_SIGNATURE}" "${MANIFEST_PATH}" --clobber --repo "${GITHUB_REPO}"
else
  gh release create "${TAG}" \
    --repo "${GITHUB_REPO}" \
    ${RELEASE_MODE} \
    --title "Clinear ${VERSION}" \
    --notes-file "${RELEASE_NOTES_FILE}" \
    "${DMG_PATH}" \
    "${UPDATE_BUNDLE}" \
    "${UPDATE_SIGNATURE}" \
    "${MANIFEST_PATH}"
fi

echo "GitHub release ready: ${TAG}"
