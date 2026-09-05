# CHROMA RIFT

迷宮の中を一人称で歩き、見え方を比べ、帰路の変化を発見するiPhone向け探索ゲームです。通常本編は1章「帰り道のない入口」。

## 遊び方

ホームの「遊ぶ」→ 初回だけ3問 → 操作案内 → 入口 → 消えない床 → 重なる鍵 → 帰路 → 出口 → 結果。

- 左下のスティックで連続移動、右側のドラッグで見回します。近くの対象へ照準を合わせ「調べる」。左右同時操作が可能です。
- 「色をほどく」で床模様だけを無彩色にします。形や通行条件は同じです。
- 一時停止から3段階ヒント、簡単操作（短いステップ／角度旋回）、感度、左右配置、低品質、補助表示を選べます。
- 初回は3回答だけ。スキップでき、保存済みなら省略。詳細12問は「設定 → 詳しく調整する」に残しています。

初回調整は以前の最大24タップから3タップを維持。開始まで5タップ、スキップ／設定済みなら2タップです。章の初見5〜8分は設計目標で、実測していません。時間制限・減点はありません。

## 技術

Expo 57、React Native 0.86.3、React 19.2.3を継続。3DはThree 0.185.1＋React Three Fiber 9.7.0 native Canvas。調整・ラボ・旧2.5D迷宮はSkia 2.6.2です。ThreeオブジェクトをReanimatedへ渡しません。

Expo依存はexpo-gl 57.0.2、expo-asset 57.0.16、expo-file-system 57.0.6。@types/three 0.185.4は開発依存です。解決版はpackage-lock.jsonに固定しています。

色模様の見かけの奥行き、通常の3D投影、鍵の投影整列、遮蔽中の部屋差し替えは別の仕組みです。色の感じ方で正解条件を変えません。

## iPhoneで起動

**Goal 002のDevelopment BuildへのReloadだけでは動きません。expo-glを含む新しいDevelopment Buildが必要です。** 古いビルドは案内からホームへ戻れます。

既存の認証・登録端末・developmentプロファイルを使い、ユーザー自身が実行します。

```sh
cd /home/mhirotaka/workspace/chroma-rift
npx eas-cli@latest build --platform ios --profile development
```

完成したビルドを登録済みiPhoneへインストールした後:

```sh
npm run start:dev-client:tunnel
```

新しいCHROMA RIFTからMetroへ接続します。LANでは `npm run start:dev-client` も利用可能。署名やBundle IDを作り直す手順ではありません。[実機チェックリスト](docs/IPHONE_VALIDATION.md)

## 開発と保存

WSL内でNode.js 24とnpmを使用。nvmは必須ではありません。新規チェックアウトは `npm ci`。検証は `npm run check`、`npm run doctor`、`npx expo install --check`、`git diff --check`。checkはlint、型検査、Jest、iOS JS exportを実行します。

既存v1/v2設定・詳細生回答・プロフィール・旧スコアを保持。一人称の章と操作設定は別のversion付きキーです。「章を最初から」は章だけ、「全データを削除」は旧新の保存を削除します。不正JSONや未知の版は自動削除しません。旧2.5D、旧レール、最小一人称検証室は開発ビルドの設定画面に残しています。

新しいiPhoneビルドでのGL描画、VoiceOver、触覚、酔い、色の奥行き、性能は未確認です。テストやJS exportは60fpsや快適性を実証しません。広告・課金・共有API・バックエンド・カメラ／センサー権限は追加していません。

[検証記録](docs/GOAL-003.md) · [設計判断](docs/ADR-003-FIRST-PERSON.md) · [完全な攻略](docs/FIRST_PERSON_CHAPTER.md) · [Goal 002](docs/GOAL-002.md)