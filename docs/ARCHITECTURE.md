# Architecture

## Screen state flow

アプリは routing package を使わず、`src/app/state.ts` の discriminated union action と reducer で制御します。

```text
welcome
  -> calibrationInstructions -> calibration -> calibrationResult -> microMaze -> stageResult
  -> microMaze (未調整で試す) -> stageResult
  -> settings -> calibrationInstructions | welcome
  -> developerLab -> welcome  (__DEV__ のみ)
```

再起動時は保存済みプロファイル、調整セッション、設定、ベストスコアを復元し、安全な `welcome` から開始します。迷路中に AppState が非 active になると停止し、明示的な再開を要求します。

## Responsibility boundaries

- `src/domain/calibration`: 型、12 試行生成、プロファイル計算。React/Skia に依存しない純粋 TypeScript。
- `src/domain/maze`: レベル目標、スコア、線分距離と最短レール選択。純粋 TypeScript。
- `src/storage`: version 1 document の手書き runtime guard、AsyncStorage の失敗隔離。
- `src/screens` / `src/components`: 意味的な画面状態、回答、設定、アクセシビリティ。
- `src/rendering`: Skia 形状と Reanimated shared value。
- `src/platform`: 失敗しても操作を妨げない軽いハプティクス。
- `src/theme`: 中立 UI 色と実験用 sRGB 刺激定数。

## Skia and Reanimated

調整刺激は Skia のコード生成リング、交差レール、オフセットドットだけで構成されます。明示的な不透明 sRGB 色、同じ線幅、blur/glow/shadow/gradient/texture/motion なしで、回答まで静止します。幅と高さから毎回論理 point の geometry を計算するため、単一 iPhone 幅には固定されません。

迷路は Skia で全レール、開始、ゴール、オーブ、Depth Assist 記号を描きます。オーブ位置は Reanimated shared value と derived value で進み、React state は分岐到着、選択、完了、一時停止の意味イベントだけで更新します。unmount と pause で animation を cancel します。Reduced Motion では移動を 120ms に短縮し、装飾 motion を使いません。

## Gesture and hit testing

Gesture Handler の Tap gesture は canvas 上の point だけを渡します。純粋関数 `findNearestEligibleRail` は現在分岐の赤・青 polyline に対する最短線分距離を計算し、28pt 内で最も近いものを選びます。範囲外は無視し、有効選択後は次の分岐まで input を lock します。full-screen invisible button はありません。各分岐には同じ赤/青選択を行う 44pt 以上の accessible button もあります。

## Storage schema

Key: `chroma-rift.application.v1`

Version 1 document:

```text
schemaVersion: 1
calibrationProfile?: calculated profile and metrics
calibrationSession?: seed, environment, 12 trials, local responses
settings: Depth Assist, reduced motion/override, effect strength, haptics
bestMazeScore: number
onboardingComplete: boolean
developerLab?: parameters (__DEV__ only)
```

Raw JSON is parsed as `unknown`; nested enums, primitives, trials, responses, profile metrics, settings and developer values are guarded. Malformed JSON, an unsupported version, or storage I/O failure returns safe defaults. No PII, secret, account identifier, or network upload exists.

## Development-build delivery boundary

The ordinary Expo Go app currently available from the App Store is not a compatible validation runtime for this Expo SDK 57 project. Physical testing therefore uses a project-specific iOS development build containing `expo-dev-client`, Skia, Reanimated/Worklets, Gesture Handler, Haptics, and AsyncStorage.

The delivery pieces have separate responsibilities:

- Metro runs in Windows/WSL2 and serves the TypeScript/JavaScript bundle. `npm run start:dev-client` targets the installed development client; the tunnel variant is only a WSL2/restrictive-network fallback.
- The project-specific development build is a signed native iPhone app installed before validation. It launches from its own icon and provides the development-client launcher that connects to Metro.
- EAS Build runs remotely and creates that signed development build. The checked-in `eas.json` only describes the build profile; it does not authenticate, register devices, create credentials, or request a build.
- Ordinary Expo Go is a generic App Store client and is not used for SDK 57 validation here.
- A final App Store production build is a later distribution artifact, distinct from both Metro and the internal development build.

After the native development build is installed, normal TypeScript/JavaScript changes can usually load from Metro without rebuilding. Native dependencies, config plugins, permissions, entitlements, or other native-configuration changes require a new development build.

This slice still has no tracked `ios/` directory or local CocoaPods/signing material. Windows/WSL2 can run Metro and, after user authentication, request the EAS cloud iOS build. A signed build for a physical iPhone requires an Apple Developer Program account, device registration, and Developer Mode on the iPhone. TestFlight/App Store work later requires a confirmed bundle identifier, controlled signing credentials, native privacy review, and physical regression testing.
