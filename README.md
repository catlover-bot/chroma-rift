# CHROMA RIFT

CHROMA RIFT（色彩立体錯視ゲーム）は、赤と青で生じることがある奥行き感を、短い迷路操作に使えるか検証する iPhone 向け実験プロトタイプです。このリポジトリは完成版ゲームではなく、12 問の調整、型付き知覚プロファイル、3 分岐マイクロ迷路、開発者刺激ラボを含む最初の垂直スライスです。

## 技術スタック

- Expo SDK 57 / React Native 0.86 / React 19
- TypeScript（strict）
- React Native Skia（刺激、レール、オーブの描画）
- React Native Reanimated 4 + Worklets（フレーム単位のオーブ移動）
- Gesture Handler、Safe Area Context、Expo Haptics、AsyncStorage
- Jest / jest-expo / React Native Testing Library

Skia は、ブラウザーや WebView を経由せず、同じコード生成形状を iPhone のネイティブ描画面に表示できるため選びました。色刺激とゲーム表示のパラメータを明確に分離でき、毎フレーム React state を更新せずに Reanimated の shared value を直接描画へ渡せます。

## セットアップ

Node.js 24 LTS と npm を使用します。

```sh
nvm use
npm ci
npm start
```

Windows/WSL2 ではリポジトリを WSL の Linux ファイルシステム内に置き、WSL シェルからコマンドを実行してください。LAN 経由で iPhone から Metro に接続できない場合は次を使用します。

```sh
npx expo start --tunnel
```

## npm scripts

- `npm start`: Expo 開発サーバー
- `npm run android`: Android で開く
- `npm run ios`: iOS で開く（macOS が必要になる場合があります）
- `npm run lint`: ESLint
- `npm run typecheck`: TypeScript 検査
- `npm run test`: Jest を一度実行
- `npm run test:watch`: Jest の watch モード
- `npm run doctor`: Expo Doctor（`check` とは別）
- `npm run export:ios`: iOS 用 production JavaScript export
- `npm run check`: WSL2 で lint、型、テスト、iOS export を順番に検証

## 実機 iPhone（Expo Go）

1. iPhone に現行の Expo Go をインストールします。
2. このディレクトリで `npx expo start` を実行します。
3. iPhone の Expo Go で QR コードを開きます。
4. WSL2 の LAN 接続が届かなければ `npx expo start --tunnel` を使います。
5. [実機検証手順](docs/IPHONE_VALIDATION.md)を最初から最後まで実施します。

この Goal では Expo Go が Skia、Reanimated、Gesture Handler、AsyncStorage を含むため、ネイティブ `ios/` ディレクトリや EAS build は不要です。

## 安全性、プライバシー、既知の制約

見え方は利用者、表示装置、明るさ、True Tone、Night Shift などで変わります。この実験は医療検査ではありません。眼精疲労、違和感、頭痛が出た場合は直ちに中止してください。高速点滅、全画面輝度パルス、音声は使用していません。

通常動作にバックエンド、アカウント、分析、広告、ネットワークアップロードはありません。カメラ、マイク、位置情報、追跡、連絡先、写真、通知の権限も要求しません。データは端末内の AsyncStorage のみに保存され、設定画面から削除できます。

物理的な色奥行き効果、触覚、セーフエリアは実機で確認する必要があります。自動テストや export は錯視の成立を証明しません。iOS bundle identifier `com.hirotakam.chromarift` は暫定値であり、App Store 登録前に確認が必要です。Expo SDK 57 の iOS 最低要件は 16.4 です。

`npm audit --omit=dev` は Expo の build/config CLI 経路（`xcode` → `uuid` を含む）に 10 件の moderate advisory を報告します。high/critical はなく、提示される自動修正は Expo 46 への非互換 downgrade のため適用していません。アプリは該当 CLI 経路や `uuid` API を通常実行時に使用しません。また、直接依存はすべて stable ですが、必須の Worklets → Babel が npm 上で唯一かつ `latest` の `gensync@1.0.0-beta.2` を推移的に含みます。これは本プロジェクトが選択した pre-release API ではなく、SDK 57 の必須 toolchain に由来する既知の例外です。

詳細は [アーキテクチャ](docs/ARCHITECTURE.md)、[技術判断](docs/ADR-001-EXPO-SKIA.md)、[実験ログ](docs/EXPERIMENT_LOG_TEMPLATE.md)、[ロードマップ](docs/ROADMAP.md)を参照してください。
