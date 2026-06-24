# Distribution

Clinear is currently planned for direct macOS distribution, not the Mac App Store.

## macOS identity

- Bundle identifier: `app.moonbunny.clinear`
- Release version source: `src-tauri/tauri.conf.json`; `package.json` and `src-tauri/Cargo.toml` intentionally use
  `0.0.0`
- Signing identity: `Developer ID Application: Yulian Glukhenko (XRRAJG7BU8)`
- Initial supported architecture: Apple Silicon only, using `aarch64-apple-darwin`

Do not commit certificates, private keys, `.p12` exports, updater private keys, or App Store Connect `.p8` files.

## Local signed build

The Developer ID Application certificate must be installed in the local login keychain and visible in:

```sh
security find-identity -v -p codesigning
```

For a local Apple Silicon DMG build:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Yulian Glukhenko (XRRAJG7BU8)"
export TAURI_SIGNING_PRIVATE_KEY_PATH="$HOME/.tauri/clinear-updater.key"
pnpm release:mac
```

`pnpm release:mac` builds the app, submits the DMG to Apple notarization, staples the notarization ticket, then verifies
the stapled DMG with Gatekeeper and `hdiutil`.

## Notarization

Developer ID distribution should be notarized. Use App Store Connect API-key auth for local release scripts.

Required API-key environment variables:

```sh
export APPLE_API_ISSUER="..."
export APPLE_API_KEY="..."
export APPLE_API_KEY_PATH="/path/to/AuthKey_....p8"
```

Apple ID notarization is also supported, but keep app-specific passwords out of shell history and source control.

## Local GitHub releases

Release hosting target:

```txt
https://github.com/mnbny/clinear
```

Clinear releases are built locally and published through the GitHub CLI. Do not add GitHub Actions release automation
unless the project deliberately changes release ownership later.

Local release publishing uses:

```sh
pnpm release:github
```

This creates a draft GitHub release for the version in `src-tauri/tauri.conf.json`. Pass `--publish` to publish
immediately:

```sh
pnpm release:github -- --publish
```

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
