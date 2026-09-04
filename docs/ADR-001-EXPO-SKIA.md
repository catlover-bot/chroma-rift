# ADR-001: Expo and React Native Skia

- Status: accepted
- Scope: Goal 001 physical-iPhone chromostereopsis validation

## Decision

Use stable Expo SDK 57, React Native, strict TypeScript, React Native Skia, Reanimated 4/Worklets, Gesture Handler, Safe Area Context, Expo Haptics, and AsyncStorage. Run the first validation build in Expo Go. Expo SDK 57 targets React Native 0.86 / React 19.2.3 and has an iOS 16.4 minimum; the project does not lower that target.

## Rationale

The central risk is whether code-rendered red/blue stimuli make a usable depth impression on a real iPhone and support direct rail selection. Skia gives a native, responsive, code-generated drawing surface while Reanimated keeps motion off React's per-frame state path. Expo supplies a repeatable WSL-compatible JavaScript workflow and a direct physical-device path without generating native projects during this Goal.

## Alternatives considered

- Capacitor + PixiJS: browser/Canvas/WebView-first and therefore weaker evidence for the native display loop.
- Native SpriteKit: excellent Apple-native rendering, but requires Xcode/macOS earlier and splits the implementation from the present WSL2 environment.
- Godot: capable engine but unnecessary runtime/tooling for a three-junction interaction proof.
- Flutter: coherent renderer but would replace the required React Native/TypeScript stack and add another toolchain.

## Tradeoffs

Expo Go fixes the available native modules and is not the eventual App Store artifact. JavaScript rendering cannot prove a subjective optical effect. Skia Jest mocks validate domain and screen behavior, not pixels or perception. A later native limitation may require an EAS development build, but no speculative native project is created now.

Physical iPhone observation remains mandatory: different users and displays can change or remove chromostereopsis, and the calibration thresholds are provisional product heuristics rather than scientific or medical confidence measures.
