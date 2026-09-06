# CHROMA RIFT

迷宮の中を一人称で歩き、見え方を比べ、帰路の変化を発見するiPhone向け探索ゲームです。通常本編は1章「帰り道のない入口」。

## 遊び方

ホームの「遊ぶ」→ 初回だけ3問 → 操作案内 → 入口 → 触れない紋章 → 重なる鍵 → 帰路 → 出口 → 結果。

- 左下の広い領域をドラッグして歩き、右側をドラッグして見回します。指を離すと止まり、左右を同時に操作できます。壁の紋章や印に近づき、中央の照準と対象名を見て右下のボタンで調べます。
- 紋章を調べ、「切れずにつながる輪郭」と同じ形の印を押すと、奥の扉が開きます。「色をほどく」は任意の無彩色比較です。色の見え方は正解条件に使いません。
- 最初の一時停止メニューでドラッグ操作／ボタン操作（短いステップ・旋回）を切り替えられます。3段階ヒント、輪郭ガイド、表示A／控えめ／表示B、視点・上下の感度、左右配置、描画品質も選べます。
- Reduce Motionや文字拡大でもドラッグ操作を保ちます。VoiceOver中は読み上げ用ボタンを表示し、保存したタッチ操作は変えません。
- 初回は3回答だけ。スキップでき、保存済みなら省略。詳細12問は「設定 → 詳しく調整する」に残しています。

初回調整は以前の最大24タップから3タップを維持。開始まで5タップ、スキップ／設定済みなら2タップです。章の初見5〜8分は設計目標で、実測していません。時間制限・減点はありません。

## 技術

Expo 57、React Native 0.86.3、React 19.2.3を継続。3DはThree 0.185.1＋React Three Fiber 9.7.0 native Canvas。調整・ラボ・旧2.5D迷宮はSkia 2.6.2です。ThreeオブジェクトをReanimatedへ渡しません。

Expo依存はexpo-gl 57.0.2、expo-asset 57.0.16、expo-file-system 57.0.6。@types/three 0.185.4は開発依存です。解決版はpackage-lock.jsonに固定しています。

色模様の見かけの奥行き、通常の3D投影、鍵の投影整列、遮蔽中の部屋差し替えは別の仕組みです。色の感じ方で正解条件を変えません。

## iPhoneで起動

**expo-gl入りのGoal 003系Development Buildはそのまま使い、Metroを再読み込みします。Goal 005のためのnative再ビルドは不要です。** 実機上の再利用確認は[実機チェックリスト](docs/IPHONE_VALIDATION.md)に従います。

~~~sh
# 起動中のMetroをCtrl+Cで停止してから
cd /home/mhirotaka/workspace/chroma-rift
npx expo start --dev-client --tunnel --clear
~~~

expo-glのないGoal 002の古いbuildは起動案内が表示されます。その場合の既存手順は[Development Build案内](docs/EAS_IOS_DEVELOPMENT_BUILD.md)を参照してください。

新しいCHROMA RIFTからMetroへ接続します。LANでは `npm run start:dev-client` も利用可能。署名やBundle IDを作り直す手順ではありません。[実機チェックリスト](docs/IPHONE_VALIDATION.md)

## 開発と保存

WSL内でNode.js 24とnpmを使用。nvmは必須ではありません。新規チェックアウトは `npm ci`。検証は `npm run check`、`npm run doctor`、`npx expo install --check`、`git diff --check`。checkはlint、型検査、Jest、iOS JS exportを実行します。

既存v1/v2設定・詳細生回答・プロフィール・旧スコアを保持。一人称の章・操作設定・導入の完了/操作案内確認は別のversion付きキーです。「章を最初から」は章だけ、「全データを削除」は旧新の保存を削除します。不正JSONや未知の版は自動削除しません。旧2.5D、旧レール、最小一人称検証室は開発ビルドの設定画面に残しています。

新しいiPhoneビルドでのGL描画、VoiceOver、触覚、酔い、色の奥行き、性能は未確認です。テストやJS exportは60fpsや快適性を実証しません。広告・課金・共有API・バックエンド・カメラ／センサー権限は追加していません。

[Goal 005検証記録](docs/GOAL-005.md) · [錯視と検証の区別](docs/ILLUSION-EVIDENCE.md) · [Goal 004](docs/GOAL-004.md) · [ドラッグ操作設計](docs/CONTROLS-DESIGN.md) · [設計判断](docs/ADR-003-FIRST-PERSON.md) · [完全な攻略](docs/FIRST_PERSON_CHAPTER.md) · [Goal 002](docs/GOAL-002.md)
