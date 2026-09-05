# ADR-001: Expo and React Native Skia

Goal 002 amendment: retain this installed stack and development build, replacing normal rail gameplay with two small authored 2.5D stages. Pure TypeScript projects 3D coordinates and orders visible faces; Skia draws the resulting geometry without an automatic Z buffer. Two discrete camera poses suffice. No new engine, native module, permission, or build configuration is introduced. The original rail experiment remains only in development settings; current behavior is documented in `ARCHITECTURE.md`.

- Status: accepted; delivery path amended by Goal 001.1
- Scope: Goal 001 physical-iPhone chromostereopsis validation

## Decision

Use stable Expo SDK 57, React Native, strict TypeScript, React Native Skia, Reanimated 4/Worklets, Gesture Handler, Safe Area Context, Expo Haptics, and AsyncStorage. Run physical-iPhone validation in a project-specific Expo development build produced by EAS Build, never in the currently available ordinary App Store Expo Go runtime. Expo SDK 57 targets React Native 0.86 / React 19.2.3 and has an iOS 16.4 minimum; the project does not lower that target.

## Rationale

The central risk is whether code-rendered red/blue stimuli make a usable depth impression on a real iPhone and support direct rail selection. Skia gives a native, responsive, code-generated drawing surface while Reanimated keeps motion off React's per-frame state path. Expo supplies a repeatable WSL-compatible JavaScript workflow. `expo-dev-client` ensures the installed validation app contains this project's SDK 57 native module set, while EAS provides a cloud iOS build path without committing a generated native project.

## Alternatives considered

- Capacitor + PixiJS: browser/Canvas/WebView-first and therefore weaker evidence for the native display loop.
- Native SpriteKit: excellent Apple-native rendering, but requires Xcode/macOS earlier and splits the implementation from the present WSL2 environment.
- Godot: capable engine but unnecessary runtime/tooling for a three-junction interaction proof.
- Flutter: coherent renderer but would replace the required React Native/TypeScript stack and add another toolchain.
- Ordinary Expo Go: rejected for this validation because the currently distributed App Store runtime is not compatible with the project's Expo SDK 57 runtime.

## Tradeoffs

The development build requires Expo and Apple Developer authentication, physical-device registration, remote signing credentials, installation, and iPhone Developer Mode. It is not the eventual App Store artifact. Metro can deliver later JavaScript/TypeScript changes without rebuilding, but any native dependency or native-configuration change requires another development build. JavaScript rendering cannot prove a subjective optical effect, and Skia Jest mocks validate domain and screen behavior rather than pixels or perception.

Only the minimal EAS development profile is committed. This decision does not add EAS Update, runtime channels, preview/production profiles, credentials, TestFlight automation, or an `ios/` directory. Authenticated build and registration commands remain explicit user actions.

Physical iPhone observation remains mandatory: different users and displays can change or remove chromostereopsis, and the calibration thresholds are provisional product heuristics rather than scientific or medical confidence measures.
