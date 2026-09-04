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

## Future native paths

This slice intentionally has no `ios/` directory, CocoaPods, signing, EAS authentication, or cloud build. If Expo Go later lacks a concrete native feature, the next controlled path is an EAS development build. TestFlight/App Store work then requires macOS/Xcode or EAS, a confirmed bundle identifier, signing credentials held outside this repository, native privacy review, and physical regression testing.
