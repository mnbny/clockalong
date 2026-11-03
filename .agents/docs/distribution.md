# Distribution

Clockalong uses direct macOS distribution for Apple Silicon. Releases are built locally and hosted in the project's GitHub Releases.

The native application configuration owns the release version. JavaScript and Cargo package versions are placeholders, not independent release versions.

## Build and signing

The release launcher loads production configuration and preserves exported overrides. Development configuration is excluded.

The local release flow builds a Developer ID-signed app, creates the installer, submits it for notarization, staples the ticket, and verifies the result. Apple notarization uses App Store Connect API-key authentication.

Apple signing and updater signing are separate trust mechanisms. Private keys and certificates remain outside source control. Signing-key paths are supplied explicitly.

Linear's client ID and Telegram's app ID and hash are embedded at build time. Packaged apps do not need launch-time environment configuration. These bundled values remain extractable; they are distinct from user credentials.

Missing optional-provider configuration affects only that provider.

## Publishing and updates

Local publishing uses the GitHub CLI and creates a draft release by default. Explicit publishing makes the release public. Publishing requires a clean working tree unless its override is supplied.

The release contains the installer, updater bundle, signature, and static updater manifest. Supplied release notes populate both the GitHub release and updater manifest.

Tauri's updater reads the manifest from the latest GitHub Release. The app controls update checks and presents install and restart actions. Release tooling owns artifact preparation and signing; native app integration owns the user experience.
