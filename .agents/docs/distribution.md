# Distribution

Clockalong is currently planned for direct macOS distribution, not the Mac App Store.

## macOS identity

- Bundle identifier: `app.moonbunny.clockalong`
- Release version source: `src-tauri/tauri.conf.json`; `package.json` and `src-tauri/Cargo.toml` intentionally use `0.0.0`
- Signing identity: `Developer ID Application: Yulian Glukhenko (XRRAJG7BU8)`
- Initial supported architecture: Apple Silicon only, using `aarch64-apple-darwin`

Do not commit certificates, private keys, `.p12` exports, updater private keys, or App Store Connect `.p8` files.

## Local signed build

The Developer ID Application certificate must be installed in the local login keychain and visible in:

```sh
security find-identity -v -p codesigning
```

Local Apple Silicon DMG builds require explicit paths for the updater signing key and the App Store Connect API key. Supply both paths through local production configuration or exported environment variables. Neither key has a default location.

`pnpm release:mac` builds the app, submits the DMG to Apple notarization, staples the notarization ticket, then verifies the stapled DMG with Gatekeeper and `hdiutil`.

Provider app credentials come from the build environment. The normal release launcher loads local production configuration and preserves exported overrides. Cargo embeds Telegram's app ID and hash and Linear's OAuth client ID in the native binary. Packaged apps do not need these variables at launch. Changes to the embedded app values trigger a rebuild.

Existing release scripts inherit these variables. The launcher preserves command arguments, piped release notes, and exit codes. It loads only app, Apple, and updater-signing prefixes from production env files. Development env files remain excluded.

The bundled app values remain extractable. Build-time configuration keeps the values out of source; it does not make distributed values confidential. Missing configuration affects only the corresponding optional provider.

## Notarization

Developer ID distribution should be notarized. Use App Store Connect API-key auth for local release scripts.

Required API-key variables, supplied through production configuration or the build environment:

```sh
export APPLE_API_ISSUER="..."
export APPLE_API_KEY="..."
export APPLE_API_KEY_PATH="/path/to/AuthKey_....p8"
```

Apple ID notarization is also supported, but keep app-specific passwords out of shell history and source control.

## Local GitHub releases

Release hosting target:

```txt
https://github.com/mnbny/clockalong
```

Clockalong releases are built locally and published through the GitHub CLI. Do not add GitHub Actions release automation unless the project deliberately changes release ownership later.

Local release publishing uses:

```sh
pnpm release:github
```

This creates a draft GitHub release for the version in `src-tauri/tauri.conf.json`. Pass `--publish` to publish immediately:

```sh
pnpm release:github -- --publish
```

Pass GitHub release notes through stdin when publishing:

```sh
pnpm release:github << 'EOF'
## Changes

- Added native provider auth refresh handling.
- Cleaned up app service module names.
EOF
```

The same notes are written into the Tauri updater manifest. If the GitHub release already exists, the script updates the release body only when notes are provided.

The release script expects `gh` authentication and a clean working tree unless `ALLOW_DIRTY_RELEASE=1` is set.

## Updates

Use Tauri's updater plugin for direct-download updates. The updater signing key is separate from Apple code signing.

Initial update strategy:

- publish installer DMGs through GitHub Releases
- publish Tauri updater artifacts to the same release
- serve a static `latest.json` from the latest GitHub Release
- expose update checks from Settings
- check for updates from the root app shell after launch and every six hours
- show an app-wide update toast with an install action when a new version is available
- do not silently restart the app, because active time tracking should stay user-controlled
