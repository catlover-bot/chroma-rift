# EAS iOS development build: authenticated user procedure

> Historical initial-install procedure. The user has completed development-build installation and launch. Goal 002 changes only JavaScript/TypeScript: use `IPHONE_VALIDATION.md` to reload the existing build. Do not repeat authentication, signing, project linking or cloud build for this change. Existing project and bundle identifiers are retained.

This procedure is intentionally not executed by the unauthenticated repository-preparation Goal. It requires an Expo account, an active Apple Developer Program membership, and the physical iPhone. Never commit passwords, authentication tokens, Apple IDs, private keys, provisioning profiles, or real account identifiers.

The repository already contains `expo-dev-client` and an `eas.json` development profile. The bundle identifier `com.hirotakam.chromarift` remains provisional; confirm it before allowing EAS to register an App ID.

## 1. Install or update EAS CLI

Run this in WSL2. Installing the CLI accesses npm but does not authenticate, register a device, or build the app.

```sh
npm install --global eas-cli
eas --version
```

Using `npx eas-cli@latest` instead is also valid if a global install is undesirable.

## 2. Authenticate and verify the Expo account

These commands access the user's Expo account. Enter credentials only into the CLI or browser prompt, never into repository files.

```sh
eas login
eas whoami
```

## 3. Configure the iOS project for EAS

This command accesses the Expo account and may modify tracked configuration such as `eas.json` or `app.json`. It must not generate a native `ios/` directory for this managed project.

```sh
eas build:configure --platform ios
git status --short
git diff -- eas.json app.json package.json
```

Inspect every generated change. Keep the existing `build.development.developmentClient: true` and `distribution: internal` settings. Do not add an owner, project ID, Apple team ID, credential path, or App Store Connect application ID without confirming the real value and understanding why EAS requested it.

## 4. Register the physical iPhone

This accesses the Expo account and Apple Developer account, collects the physical device UDID through Apple's registration flow, and registers that device for internal distribution.

```sh
eas device:create
```

Open the registration link on the target iPhone and complete the prompted profile/device-registration steps. Confirm the intended device appears in the EAS device list before building. Device registration changes remote Apple/Expo state; it should not place credentials or provisioning profiles in this repository.

## 5. Request the cloud development build

This accesses both accounts, may create or reuse remote signing credentials, and creates a billable/quotable EAS cloud build. Review every prompt before accepting.

```sh
eas build --platform ios --profile development
```

This Goal has not run that command. The user is responsible for confirming the provisional bundle identifier, Apple team, registered device, and remote credential choices.

## 6. Install and trust the result

Open the completed EAS build page on the registered iPhone and install the internal-distribution build. Launch CHROMA RIFT from its own home-screen icon, not from ordinary App Store Expo Go. If iOS requests Developer Mode, enable it under Settings → Privacy & Security → Developer Mode and follow the restart/confirmation prompts.

## 7. Connect the development client to Metro

Start Metro on the normal LAN path:

```sh
npm run start:dev-client
```

Open the installed CHROMA RIFT development client. Its launcher should discover Metro on the same network; a Metro QR code, when offered, must be opened by this project-specific client rather than ordinary Expo Go.

If WSL2 LAN routing or a restrictive network prevents discovery, stop Metro and use:

```sh
npm run start:dev-client:tunnel
```

Tunnel mode is a connectivity fallback, not a substitute for installing the signed development build.

Once the development build is installed, ordinary TypeScript/JavaScript changes can usually reload from Metro. Rebuild with EAS after changing a native dependency, config plugin, entitlement, permission, or other native application configuration.

## Side-effect summary

| Step | Expo account | Apple Developer account | Tracked files | Remote credentials | Device registration | Cloud build |
|---|---|---|---|---|---|---|
| Install EAS CLI | No | No | No | No | No | No |
| `eas login` / `eas whoami` | Yes | No | No expected | No | No | No |
| `eas build:configure --platform ios` | Yes | Possibly later prompts | May modify config | No build credential expected; inspect prompts | No | No |
| `eas device:create` | Yes | Yes | No expected | May use Apple authentication remotely | Yes | No |
| `eas build --platform ios --profile development` | Yes | Yes | No expected | Creates or reuses remote signing credentials | Uses registered devices | Yes |
| Install build / enable Developer Mode | Build download only | No account login expected | No | No | Uses prior registration | No new build |

After installation, continue with `IPHONE_VALIDATION.md`. Physical perception, haptics, permission behavior, and safe areas remain unverified until that protocol is performed on the actual iPhone.
